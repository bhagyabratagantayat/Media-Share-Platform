# PHASE 7 — SOCIAL MEDIA TEAM, BULK UPLOAD & OFFICIAL MEDIA WORKFLOW TECHNICAL REPORT

## 1. Executive Summary

Phase 7 successfully designs, implements, and tests the complete **Official Social Media Team Bulk Media Management & Publishing Workflow** for the platform. Built on top of the Phase 4 Direct-to-Storage engine, Phase 5 asynchronous media processing pipeline, and Phase 6 edge CDN distribution architecture, Phase 7 empowers authorised organization staff to upload, organize, publish, and audit hundreds of high-resolution photos and 4K videos concurrently with zero application server bottlenecks.

All 28 test suites across the repository (117 test cases total) pass cleanly.

---

## 2. Completed Architecture & Deliverables

### 2.1 Database Modeling & Schema Enhancements
*   **`UploadBatch` Model**: Enforces transactional tracking of bulk media sessions with fields `totalFiles`, `completedFiles`, `failedFiles`, `cancelledFiles`, `totalBytes`, `uploadedBytes`, `status` (`CREATED`, `UPLOADING`, `COMPLETED`, `PARTIALLY_FAILED`, `FAILED`, `CANCELLED`), `uploadType`, `createdBy`, `eventId`, `albumId`, and `organisationId`.
*   **`UploadBatchItem` Model**: Granular per-file state tracking (`PENDING`, `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `CANCELLED`) with storage link, error logging (`errorCode`, `errorMessage`), and direct relationship to `MediaItem`.
*   **Composite Indexing & Integrity**:
    *   `@@index([organisationId, eventId, status])`
    *   `@@index([organisationId, createdBy])`
    *   `@@index([batchId, status])`
    *   Cascade deletes for batch items on batch deletion while strictly retaining uploaded `MediaItem` records.

### 2.2 Permissions & Role-Based Access Control (RBAC)
*   Granular batch and publishing permissions registered in `src/server/permissions/permissions.ts`:
    *   `MEDIA_BATCH_CREATE`: Authorised creation of multi-file upload batches.
    *   `MEDIA_BATCH_CANCEL`: Immediate cancellation and quota cleanup for active batches.
    *   `MEDIA_PROCESSING_RETRY`: Re-enqueueing failed jobs to the BullMQ media worker.
    *   `MEDIA_ALBUM_ASSIGN`: Bulk organization of items into events/albums.
    *   `MEDIA_ARCHIVE`: Bulk unpublishing and private restriction of event media.
*   Enforced role boundaries:
    *   `ORGANISATION_OWNER` & `ORGANISATION_ADMIN`: Full governance, storage quota control, team assignments.
    *   `SOCIAL_MEDIA_MANAGER`: Full bulk upload, batch retry/cancellation, album assignment, and publication rights.
    *   `SOCIAL_MEDIA_MEMBER`: Bulk upload and batch lifecycle management for assigned events.
    *   `USER` / Regular Attendee: Strictly forbidden from initiating `OFFICIAL` uploads or bulk staff actions.

### 2.3 Batch Service Engine (`src/server/batches/service.ts`)
*   **Chunked Preparation Pipeline**: Automatically processes batch items in configurable chunks (default 25) to avoid database lock contention and memory spikes during massive batch initialization.
*   **Direct-to-Storage Session Creation**: Generates short-lived presigned upload URLs (single PUT or multi-part chunks) scoped strictly to tenant paths:
    `organisations/{orgId}/events/{eventId}/media/{mediaId}/original/{filename}`.
*   **State Reconciliation & Auto-Publishing**: Automatically detects when all items reach terminal states and updates overall `UploadBatch` status to `COMPLETED` or `PARTIALLY_FAILED`. If `autoPublishOfficialMedia` is enabled on the Organisation, media items are immediately published to CDN galleries upon processing completion.
*   **Duplicate Checksum Detection**: Rapidly compares file SHA-256 hashes against existing event media to prevent duplicate storage consumption.
*   **Media Team Stats Engine**: Calculates real-time quota usage, storage percentages, active pipeline counts, and recent batch summaries for the dashboard.

### 2.4 Official Media Management & Publishing (`src/server/media/official-service.ts`)
*   `bulkPublish`: Atomically transitions batches of `READY` items to `isPublished: true` with audit logging (`MEDIA_BULK_PUBLISHED`).
*   `bulkArchive`: Hides media from public/attendee views with audit logging (`MEDIA_BULK_ARCHIVED`).
*   `bulkAssignAlbum`: Reassigns media items across event albums while validating tenant boundaries.
*   `bulkRetryProcessing`: Re-enqueues failed transcoding/optimization jobs back to Redis/BullMQ worker queues.

### 2.5 Team Management Service (`src/server/team/service.ts`)
*   Manages Social Media Team member delegation (`SOCIAL_MEDIA_MANAGER`, `SOCIAL_MEDIA_MEMBER`, `MODERATOR`).
*   Prevents privilege escalation and self-demotion.
*   Revocation lifecycle: Revoking a member automatically invalidates and cancels their open upload sessions to protect organization storage.

### 2.6 Client-Side Concurrency Controller (`src/lib/upload/batch-upload-manager.ts` & `src/hooks/use-batch-uploader.ts`)
*   **Concurrency Pool**: Browser-side concurrent upload worker pool (configurable between 2 to 12 streams, default 6) ensuring network pipe saturation without crashing browser memory.
*   **Direct Upload**: Zero bytes pass through the Node.js API server; binaries stream directly to S3/R2/MinIO via signed PUTs or multipart slices.
*   **Granular Metrics**: Live MB/s upload speed calculation, remaining time (ETA) countdown, overall and per-file progress meters.
*   **Resilience & Recovery**: Granular per-file cancel and retry controls, plus whole-batch cancellation.

### 2.7 Frontend UI Pages & Hub
*   `/organisations/[slug]/media-team`: Command center with live storage usage meter, active batch cards, processing queue status, and recent batches table.
*   `/organisations/[slug]/media-team/upload`: Bulk upload interface with event/album selection, drag-and-drop dropzone, folder upload support, format validation, concurrency sliders, and live upload progress monitor.
*   `/organisations/[slug]/media-team/batches`: Batch history with status filters, progress bars, and pagination.
*   `/organisations/[slug]/media-team/batches/[batchId]`: Batch details inspector with per-item status filtering, search by filename, retry-failed action, and bulk publishing.
*   `/organisations/[slug]/settings/team`: Team member management console with role assignment modals and permission audits.

---

## 3. Automated Test Verification

A dedicated test suite `tests/social-media-team-batch.test.ts` was executed alongside the existing test suite:

```text
✓ tests/events.test.ts (5 tests)
✓ tests/media-metadata.test.ts (4 tests)
✓ tests/media-processor.test.ts (3 tests)
✓ tests/uploads.test.ts (14 tests)
✓ tests/social-media-team-batch.test.ts (9 tests)
✓ tests/event-security.test.ts (5 tests)
✓ tests/auth.test.ts (8 tests)
✓ tests/media-access.test.ts (3 tests)
✓ tests/concurrency-simulation.test.ts (1 test)
✓ tests/albums.test.ts (4 tests)
✓ tests/download-permissions.test.ts (5 tests)
✓ tests/storage.test.ts (5 tests)
✓ tests/organisation.test.ts (4 tests)
✓ tests/cdn-tokens.test.ts (5 tests)
✓ tests/org-access.test.ts (3 tests)
✓ tests/rbac.test.ts (4 tests)
✓ tests/cache-security.test.ts (3 tests)
✓ tests/tenant-isolation.test.ts (3 tests)
✓ tests/errors.test.ts (6 tests)
✓ tests/image-processor.test.ts (3 tests)
✓ tests/token.test.ts (3 tests)
✓ tests/password.test.ts (5 tests)
✓ tests/env.test.ts (3 tests)
✓ tests/video-processor.test.ts (2 tests)
✓ tests/media-reprocess.test.ts (1 test)
✓ tests/rate-limit.test.ts (1 test)
✓ tests/guards.test.ts (2 tests)
✓ tests/slug.test.ts (3 tests)

Test Files  28 passed (28)
     Tests  117 passed (117)
```

---

## 4. Next Milestone Readiness

Phase 7 is complete, verified, and production-ready. The system is prepared for subsequent phases (User/Attendee Uploads & Approval Workflows, Face Recognition & Vector Indexing, Subscription & Stripe Billing).
