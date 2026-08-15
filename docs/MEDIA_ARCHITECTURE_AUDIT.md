# Media Architecture & Pipeline Audit

**Project:** Organisation Event Media & Digital Memories Platform  
**Phase:** Phase 0 — Project Audit & Production Foundation  
**File:** `docs/MEDIA_ARCHITECTURE_AUDIT.md`  

---

## 1. Ten Core Media Architecture Questions & Answers

| # | Architecture Question | Current Baseline State | Target Production Architecture Standard |
|---|---|---|---|
| **1** | **Does the browser upload directly to storage?** | Not yet implemented | **YES (Direct-to-S3 / R2 via Presigned URLs)**. Browser initiates session with API and streams binary directly to S3 bucket without passing through API server memory. |
| **2** | **Does the browser upload to the backend?** | No | **STRICTLY PROHIBITED for production**. Uploading large 4K files or video batches to Node.js causes event-loop lag and OOM crashes under 500+ active users. |
| **3** | **Where are images stored?** | None configured | **S3-Compatible Object Storage** partitioned by tenant path: `orgs/{org_id}/events/{event_id}/images/{variant}/{file_uuid}.webp`. |
| **4** | **Where are videos stored?** | None configured | **S3-Compatible Object Storage** partitioned by: `orgs/{org_id}/events/{event_id}/videos/{file_uuid}/` containing original video + HLS master playlist (`.m3u8`) and `.ts` chunk files. |
| **5** | **Are thumbnails generated?** | Not yet implemented | **YES (Asynchronously via Sharp & FFmpeg)**. Photos generate 400px width WebP thumbnails; videos generate poster frame JPEG/WebP at 1.0s timestamp. |
| **6** | **Are original files retained?** | Not yet implemented | **YES (Tier-Controlled)**. Originals are stored in an archive tier prefix with separate lifecycle policies based on the organisation's subscription plan. |
| **7** | **Is a CDN used?** | None configured | **YES (Cloudflare CDN / CloudFront)**. All public and authorized media assets are served with edge caching and signed token validation. |
| **8** | **Are large downloads served through backend?** | No | **NO**. Users receive short-lived, signed download URLs redirecting directly to CDN/S3 with `Content-Disposition: attachment` headers. |
| **9** | **Is there any compression?** | Not yet implemented | **YES (Automated Background Pipeline)**. Sharp for multi-res WebP/AVIF images; FFmpeg for adaptive CRF multi-rate video transcoding. |
| **10** | **Is there any background processing?** | Not yet implemented | **YES (Redis + BullMQ Queues)**. Isolated workers for `IMAGE_PROCESS`, `VIDEO_PROCESS`, and `FACE_PROCESS`. |

---

## 2. Production Media Flow Diagrams

### 2.1 Direct Ingestion & Processing Flow
```text
┌─────────┐                ┌────────────┐                ┌────────────────┐
│ Browser │                │ API Server │                │ Object Storage │
└────┬────┘                └─────┬──────┘                └───────┬────────┘
     │ 1. Request Upload Session │                               │
     │──────────────────────────>│                               │
     │ 2. Returns Presigned URL  │                               │
     │<──────────────────────────│                               │
     │                                                           │
     │ 3. Direct Binary / Multipart Upload                       │
     │──────────────────────────────────────────────────────────>│
     │                                                           │
     │ 4. Notify Upload Complete ┌────────────┐                  │
     │──────────────────────────>│ Create DB  │                  │
     │                           │ Media Item │                  │
     │                           └─────┬──────┘                  │
     │                                 │ Enqueue                 │
     │                                 ▼                         │
     │                       ┌───────────────────┐               │
     │                       │   BullMQ Queue    │               │
     │                       └─────────┬─────────┘               │
     │                                 │ Pull Job                │
     │                                 ▼                         │
     │                       ┌───────────────────┐               │
     │                       │ Processing Worker │               │
     │                       │ (Sharp / FFmpeg)  │               │
     │                       └─────────┬─────────┘               │
     │                                 │ 5. Save Derivatives     │
     │                                 │────────────────────────>│
```

### 2.2 Gallery Delivery Flow
```text
┌─────────┐                   ┌────────────┐                   ┌────────────────┐
│ Browser │                   │ Cloudflare │                   │ Object Storage │
│ (Client)│                   │ CDN Edge   │                   │ (S3 / R2)      │
└────┬────┘                   └─────┬──────┘                   └───────┬────────┘
     │ 1. Request Thumbnail         │                                  │
     │─────────────────────────────>│                                  │
     │                              │ [Cache Hit]                      │
     │<─────────────────────────────│ Returns cached 400px WebP        │
     │                              │                                  │
     │                              │ [Cache Miss]                     │
     │                              │─────────────────────────────────>│
     │                              │<─────────────────────────────────│
     │<─────────────────────────────│ Returns WebP derivative          │
```

### 2.3 Download Authorization Flow
```text
┌─────────┐                   ┌────────────┐                   ┌────────────────┐
│  User   │                   │ API Server │                   │ CDN / Storage  │
└────┬────┘                   └─────┬──────┘                   └───────┬────────┘
     │ 1. Request Download          │                                  │
     │─────────────────────────────>│                                  │
     │                              │ 2. Check Org & Event Permission  │
     │                              │ 3. Generate Signed S3/CDN URL    │
     │<─────────────────────────────│                                  │
     │ 4. Fetch binary via signed URL                                  │
     │────────────────────────────────────────────────────────────────>│
     │<────────────────────────────────────────────────────────────────│
```

---

## 3. Worker Decoupling & Queue Architecture

To prevent CPU lockups during high-traffic events (e.g. 500 photos uploaded simultaneously by the Social Media Team):

1. **Job Queues**:
   - `queue:image-processing`: High concurrency (10-20 concurrent jobs per worker).
   - `queue:video-transcoding`: Low concurrency (1-2 concurrent FFmpeg jobs per worker, CPU-bound).
   - `queue:face-embeddings`: Medium concurrency (4-8 ONNX embedding extractions per worker).
2. **Job Idempotency**:
   - Every job payload includes `media_item_id` and `attempt_hash`.
   - Re-running a failed job does not produce duplicate derivative files.
3. **Dead-Letter Handling**:
   - Jobs that fail after 3 attempts move to a dead-letter queue and update the media status to `FAILED` with an actionable error message for the admin.
