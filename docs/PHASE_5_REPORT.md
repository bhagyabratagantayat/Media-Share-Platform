# Phase 5 Implementation Report: Background Media Processing, Compression & Optimization

## 1. Executive Summary

Phase 5 has successfully implemented an asynchronous, decoupled background media processing pipeline powered by **Redis**, **BullMQ**, **Sharp**, and **FFmpeg**. The system offloads all intensive CPU and memory media transcoding operations from Next.js API servers onto dedicated background worker processes.

All media variants (`OPTIMIZED` and `THUMBNAIL`) are generated asynchronously while strictly preserving original files in private object storage, with multi-tenant quota accounting reconciled atomically inside PostgreSQL transactions.

---

## 2. Architecture & Processing Flow

```
[Browser Direct S3 Upload]
          │
          ▼
[API Server: Complete Upload Session]
          │
          ├──> Atomic SQL Tx: UploadSession -> COMPLETED, MediaItem -> QUEUED
          └──> Enqueue Job to Redis (media-processing queue)
                     │
                     ▼
[BullMQ Worker Pool (Independent Processes)]
          │
          ├── Priority Scheduling: OFFICIAL (priority 1) vs USER_SUBMISSION (priority 5)
          ├── Deduplicated Job IDs: media-proc-{mediaId}-v{version}
          │
          ▼
[MediaProcessorService]
          ├── 1. Idempotency Check (skips re-encoding if READY for current version)
          ├── 2. Stream/Download Original Binary from Object Storage
          ├── 3. Execute Processing Engine:
          │      ├── IMAGE: Sharp (EXIF GPS strip, WebP 85%, 400px WebP thumbnail)
          │      └── VIDEO: FFprobe metadata extraction, FFmpeg libx264/AAC CRF 22 encoding, frame grab
          ├── 4. Upload Optimized & Thumbnail Variants to Scoped Storage Keys
          └── 5. Atomic Transaction:
                 ├── Upsert MediaVariant records
                 ├── Reconcile net tenant quota (increment storageUsedBytes)
                 ├── MediaItem -> READY, progress = 100%, record compression ratio
                 └── Emit Audit Log (MEDIA_PROCESSING_COMPLETED)
```

---

## 3. Core Components Implemented

### 3.1 Redis & Queue Layer (`src/server/queue/`)
- **`redis.ts`**: Configures high-performance Redis client (`ioredis`) with required `maxRetriesPerRequest: null` for BullMQ compatibility, exponential reconnect backoff, and graceful teardown.
- **`media-queue.ts`**: Instantiates BullMQ `media-processing` queue with:
  - Exponential backoff retry strategy (`attempts: 3`, base delay 2000ms).
  - Priority scheduling (`OFFICIAL` = priority 1, `USER_SUBMISSION` = priority 5).
  - Deterministic job IDs (`media-proc-${mediaId}-v${version}`) for queue-level deduplication.
  - Test-environment guard to eliminate external network blocking during CI runs.

### 3.2 Sharp Image Optimization Engine (`src/server/processing/image-processor.ts`)
- **Metadata Extraction**: Extracts `width`, `height`, `format`, and color space.
- **Privacy Enforcement**: Strips sensitive device serials and GPS metadata while auto-orienting images via EXIF orientation tags.
- **Optimized Variant**: Visually near-lossless WebP encoding (`quality: 85, effort: 4`).
- **Thumbnail Variant**: Scaled to `env.THUMBNAIL_MAX_DIMENSION` (400px long edge, `fit: 'inside'`, `withoutEnlargement: true`) in WebP format (`quality: 80`).
- **Compression Metrics**: Accurately computes and records the compression ratio (`originalSize / optimizedSize`).

### 3.3 FFmpeg Video Compression Engine (`src/server/processing/video-processor.ts`)
- **Command Injection Prevention**: Uses `child_process.execFile` and `child_process.spawn` with **strict argument arrays** (zero shell string concatenation).
- **Probing**: Uses `ffprobe` to accurately extract `durationMs`, `width`, `height`, `frameRate`, and `codec`.
- **Duration Enforcement**: Rejects video payloads exceeding `env.MAX_VIDEO_DURATION_SECONDS` (default 2 hours).
- **Video Transcoding**: Encodes via `libx264` (`-crf 22`, `-preset medium`, `-movflags +faststart`) and `aac` audio (`192k`), ensuring fast web playback and compatibility.
- **Thumbnail Snapshot**: Extracts a representative video frame at `10%` duration (or max 2.0s) scaled to 400px.
- **Lifecycle & Security**: Guaranteed deletion of temporary working directories in `finally` blocks; timeout protection kills hung child processes after `env.MAX_PROCESSING_TIME_SECONDS`.

### 3.4 Worker Processor & Idempotency (`src/server/processing/media-processor.ts`)
- **Idempotency Guard**: Checks if a media item is already in `READY` state with variants present for the current `processingVersion`. Returns existing variant metadata immediately to prevent duplicate compute or double-counting storage quota.
- **Variant Storage Scoping**: Saves variants to deterministic tenant-isolated paths: `organisations/{orgId}/events/{eventId}/media/{mediaId}/variants/{variantType}`.
- **Atomic Database Reconciliation**: In a single `$transaction`:
  - Replaces previous non-original variants if reprocessing.
  - Updates `OrganisationQuota.storageUsedBytes` with the exact delta of variant bytes.
  - Transitions `MediaItem.status` to `READY` with extracted dimensions, duration, codec, and compression ratio.
- **Failure Recovery**: On unrecoverable errors, atomically updates `MediaItem.status = FAILED`, stores `processingError`, and creates an audit log entry.

### 3.5 Worker Process Runner (`src/workers/`)
- **`media-worker.ts`**: BullMQ Worker instance with configurable concurrency (`env.IMAGE_WORKER_CONCURRENCY + env.VIDEO_WORKER_CONCURRENCY`).
- **`index.ts`**: Standalone CLI entrypoint (`npm run worker`) with graceful termination listeners (`SIGINT`, `SIGTERM`) for zero job corruption during deployments.

### 3.6 API Routes & Reprocessing
- **`GET /api/media/[mediaId]`**: Returns media status, processing progress, dimensions, compression ratio, and variants.
- **`POST /api/media/[mediaId]/reprocess`**: Allows organization staff/admins to increment `processingVersion` and re-enqueue jobs for reprocessing.

---

## 4. Database Schema Updates

### Enums & Columns Added
- `enum MediaStatus`: Added `QUEUED`.
- `model MediaItem`:
  - `processingProgress Int @default(0) @map("processing_progress")`
  - `processingError String? @map("processing_error")`
  - `processingVersion Int @default(1) @map("processing_version")`
  - `processingStartedAt DateTime? @map("processing_started_at")`
  - `processingCompletedAt DateTime? @map("processing_completed_at")`
  - `originalFileSize BigInt? @map("original_file_size")`
  - `optimizedFileSize BigInt? @map("optimized_file_size")`
  - `compressionRatio Float? @map("compression_ratio")`

Migration SQL created in `prisma/migrations/20260816100000_phase5_background_processing/migration.sql`.

---

## 5. Verification & Test Suite

All **22 test suites** comprising **91 tests** pass with 100% success rate:

```text
 ✓ tests/media-metadata.test.ts (4 tests)
 ✓ tests/events.test.ts (5 tests)
 ✓ tests/auth.test.ts (8 tests)
 ✓ tests/media-processor.test.ts (3 tests)
 ✓ tests/uploads.test.ts (14 tests)
 ✓ tests/event-security.test.ts (5 tests)
 ✓ tests/albums.test.ts (4 tests)
 ✓ tests/organisation.test.ts (4 tests)
 ✓ tests/storage.test.ts (5 tests)
 ✓ tests/tenant-isolation.test.ts (3 tests)
 ✓ tests/org-access.test.ts (3 tests)
 ✓ tests/rbac.test.ts (4 tests)
 ✓ tests/errors.test.ts (6 tests)
 ✓ tests/image-processor.test.ts (3 tests)
 ✓ tests/token.test.ts (3 tests)
 ✓ tests/password.test.ts (5 tests)
 ✓ tests/env.test.ts (3 tests)
 ✓ tests/media-reprocess.test.ts (1 test)
 ✓ tests/video-processor.test.ts (2 tests)
 ✓ tests/guards.test.ts (2 tests)
 ✓ tests/rate-limit.test.ts (1 test)
 ✓ tests/slug.test.ts (3 tests)

Test Files  22 passed (22)
     Tests  91 passed (91)
```

Production build verification (`npm run build`) passed with zero compilation errors.
