# Storage Architecture Documentation

**Milestone:** Phase 4 — Production Object Storage & Signed Direct Upload Architecture  
**Target Scale:** 500+ Concurrent Active Users, Multi-Tenant Isolation  

---

## 1. Architectural Philosophy: Zero Binary Server Proxying

In traditional monolithic designs, media uploads flow from the client browser through the application server to storage. Under high traffic, proxying high-resolution photo galleries and 4K video binaries creates severe bottlenecks:
- Exhausts server RAM and process memory heap.
- Blocks Node.js event loops and threadpools.
- Saturates web server network interface bandwidth.
- Causes HTTP timeout errors and dropped client connections.

### Direct-Upload Architecture
To guarantee performance for 500+ concurrent active users and multiple parallel 2GB video uploads:
```
┌──────────────┐                  ┌─────────────────┐                  ┌────────────────┐
│ Client (Web) │                  │ Next.js Backend │                  │ Object Storage │
└──────┬───────┘                  └────────┬────────┘                  └───────┬────────┘
       │                                   │                                   │
       │ 1. POST /api/uploads/create       │                                   │
       ├──────────────────────────────────►│                                   │
       │    (fileName, mimeType, size)     │                                   │
       │                                   │ 2. Check RBAC & Permissions       │
       │                                   │    Validate MIME & Extension      │
       │                                   │    Atomic Quota Reservation       │
       │                                   │    Create UploadSession & Media   │
       │                                   │    Sign Direct S3 PUT URL(s)      │
       │                                   │                                   │
       │ 3. Return Signed Upload URL(s)    │                                   │
       │◄──────────────────────────────────┤                                   │
       │                                                                       │
       │ 4. PUT Binary File Directly (Browser to Object Storage)               │
       ├──────────────────────────────────────────────────────────────────────►│
       │◄──────────────────────────────────────────────────────────────────────┤
       │    200 OK with ETag                                                   │
       │                                                                       │
       │ 5. POST /api/uploads/[id]/complete                                    │
       ├──────────────────────────────────►│                                   │
       │    (session ID, ETag/parts)       │ 6. S3 HeadObject Verification     │
       │                                   ├──────────────────────────────────►│
       │                                   │◄──────────────────────────────────┤
       │                                   │ 7. Atomic Commit:                 │
       │                                   │    - Reserved -> Used Quota       │
       │                                   │    - Session -> COMPLETED         │
       │                                   │    - Media -> PROCESSING          │
       │                                   │    - Variant -> ORIGINAL          │
       │ 8. HTTP 200 Success               │                                   │
       │◄──────────────────────────────────┤                                   │
```

---

## 2. Storage Provider Abstraction (`StorageProvider`)

All storage interactions are strictly decoupled through the `StorageProvider` interface in `src/server/storage/storage.ts`:

```typescript
export interface StorageProvider {
  createUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  createMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string; key: string }>;
  createPartUploadUrl(key: string, uploadId: string, partNumber: number, expiresInSeconds?: number): Promise<string>;
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPartInput[]): Promise<{ etag?: string }>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  headObject(key: string): Promise<StorageObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  createDownloadUrl(key: string, expiresInSeconds?: number, filename?: string): Promise<string>;
}
```

### Implementations:
1. **`S3StorageProvider` (`src/server/storage/s3-storage.ts`)**:
   - Production provider powered by `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
   - Supports **AWS S3**, **Cloudflare R2**, **MinIO**, and any S3-compatible cloud storage.
   - Configured via environment variables with zero hardcoded endpoints or bucket names.
2. **`MockStorageProvider` (`src/server/storage/mock-storage.ts`)**:
   - In-memory storage mock implementing the full contract with mock multipart state tracking, ETag calculation, and simulated object headers for automated unit/integration testing.

---

## 3. Storage Key Partitioning & Tenant Isolation

Storage keys are deterministically generated on the server and are strictly scoped by organisation ID and event ID:

```text
organisations/{organisationId}/events/{eventId}/media/{mediaId}/original
```

Future media processing variants (Phase 5) will reside under the same deterministic root:
```text
organisations/{organisationId}/events/{eventId}/media/{mediaId}/thumbnail.webp
organisations/{organisationId}/events/{eventId}/media/{mediaId}/optimized.webp
organisations/{organisationId}/events/{eventId}/media/{mediaId}/hls/1080p.m3u8
```

### Security Rules:
- **Client key injection is disallowed**: The client cannot specify or mutate the `storageKey`.
- **Original filenames are preserved solely as database metadata** (`MediaItem.originalFileName`) to prevent directory traversal attacks, unicode path exploits, and S3 key collisions.

---

## 4. Chunked Multipart Uploads & Resumability

For large video files or high-resolution photo archives:
1. **Threshold**: Files $\ge$ `MULTIPART_CHUNK_SIZE_BYTES` (default: 10MB) initiate multipart uploads.
2. **Part URL Generation**: `POST /api/uploads/create` or `POST /api/uploads/[id]/parts` issues presigned `UploadPart` URLs for each chunk.
3. **Resumability**: If a network interruption occurs, the client queries `GET /api/uploads/[id]/status`, requests fresh signed URLs for unuploaded chunk numbers via `POST /api/uploads/[id]/parts`, and resumes without restarting the entire file.
4. **Completion**: Upon uploading all chunks, the client sends the part numbers and ETags to `POST /api/uploads/[id]/complete`, which issues `CompleteMultipartUploadCommand` to object storage.

---

## 5. Storage Quota Concurrency Protection

To prevent race conditions where multiple simultaneous uploads bypass organisation storage caps:
1. **Reservation Phase**: When an upload session is created, `storageReservedBytes` is atomically incremented by the declared file size within a database transaction. If `(storageUsedBytes + storageReservedBytes + newFileSize) > storageLimitBytes`, the upload is rejected with `HTTP 413 Quota Exceeded`.
2. **Reconciliation Phase**: When the upload completes and is verified via `headObject`, `storageReservedBytes` is decremented and `storageUsedBytes` is incremented by the verified byte count.
3. **Rollback / Cleanup Phase**: If an upload is cancelled or expires, `storageReservedBytes` is decremented, freeing space for subsequent uploads.
