# Phase 3 Implementation Report: Events, Albums & Media Metadata Foundation

## Executive Summary
Phase 3 of the **Organisation Event Media & Digital Memories Platform** has been implemented and validated. This phase establishes the production-grade data foundation, access control matrices, storage key naming architecture, server services, and user interfaces for managing **Events**, **Albums**, and **Media Metadata** within a multi-tenant framework.

No binary media files pass through the application server; all media records strictly hold database metadata, with deterministic object storage keys ready for direct S3/R2 signed uploads in Phase 4.

---

## 1. Database Architecture & Schema Extensions

The Prisma schema (`prisma/schema.prisma`) was expanded with relational integrity and composite indexes:

### Core Models Implemented
1. **`Event`**:
   - Fields: `id`, `organisationId`, `name`, `slug`, `description`, `eventDate`, `startTime`, `endTime`, `location`, `status`, `visibility`, `allowUserUploads`, `allowDownloads`, `faceSearchEnabled`, `coverMediaId`, `createdBy`, `createdAt`, `updatedAt`.
   - Constraints: `@@unique([organisationId, slug])` (ensuring clean, per-organisation unique URLs).
   - Indexes: `[organisationId, eventDate]`, `[organisationId, status]`, `[organisationId, visibility]`.

2. **`Album`**:
   - Fields: `id`, `organisationId`, `eventId`, `name`, `slug`, `description`, `coverMediaId`, `sortOrder`, `status`, `createdBy`, `createdAt`, `updatedAt`.
   - Constraints: `@@unique([eventId, slug])`.
   - Indexes: `[eventId, sortOrder]`, `[organisationId]`.

3. **`MediaItem`**:
   - Zero-binary metadata record for images and videos.
   - Fields: `id`, `organisationId`, `eventId`, `albumId`, `uploaderId`, `mediaType`, `status`, `visibility`, `approvalStatus`, `faceSearchEnabled`, `originalStorageKey`, `originalFileName`, `mimeType`, `fileSize` (BigInt), `width`, `height`, `durationMs`, `frameRate`, `codec`, `checksum`, `createdAt`, `updatedAt`.
   - Indexes: `[organisationId, eventId]`, `[eventId, albumId]`, `[eventId, createdAt]`, `[uploaderId]`.

4. **`MediaVariant`**:
   - Tracks processed representations (e.g. `ORIGINAL`, `THUMBNAIL`, `DISPLAY_WEBP`, `VIDEO_720P`, `VIDEO_1080P`).
   - Fields: `id`, `mediaItemId`, `variantType`, `storageKey`, `mimeType`, `fileSize`, `width`, `height`, `durationMs`, `codec`, `status`, `createdAt`.
   - Constraints: `@@unique([mediaItemId, variantType])`.

---

## 2. Storage Key Architecture (`storage-keys.ts`)

A deterministic, organisation-partitioned storage key structure is enforced to prepare for object storage integration:

- **Original Upload Key**:
  `organisations/{organisationId}/events/{eventId}/media/{mediaId}/original`
- **Variant Storage Key**:
  `organisations/{organisationId}/events/{eventId}/media/{mediaId}/variants/{variantType}`
- **Cover Media Storage Key**:
  `organisations/{organisationId}/covers/{resourceType}_{resourceId}`

---

## 3. RBAC & Visibility Security Matrix (`event-guards.ts`)

A fine-grained permission evaluation layer enforces strict tenant isolation:

| Role | Create Event | Update Event | Archive Event | Create Album | Reorder Albums | Upload Media | View Private/Draft |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Platform Admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Organisation Owner** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Organisation Admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Social Media Manager**| Yes | Yes | No | Yes | Yes | Yes | Yes |
| **Social Media Member** | No | No | No | No | No | Yes | Yes |
| **Moderator** | No | No | No | No | No | No | Yes |
| **Organisation Member** | No | No | No | No | No | If enabled | Only Published |
| **Pass Ticket / Guest** | No | No | No | No | No | No | Only Published |

---

## 4. Server-Side Service Layer

- **Events Service (`src/server/events/service.ts`)**:
  - `createEvent`, `getEventById`, `getEventBySlug`, `listEvents`, `updateEvent`, `archiveEvent`.
  - Transactional operations with audit logging (`EVENT_CREATED`, `EVENT_UPDATED`, `EVENT_ARCHIVED`).
  - Cursor-based pagination (`limit`, `nextCursor`, `hasMore`).
  - Multi-attribute search over `name`, `description`, and `location`.

- **Albums Service (`src/server/albums/service.ts`)**:
  - `createAlbum`, `getAlbumById`, `listAlbumsByEvent`, `updateAlbum`, `reorderAlbums`, `archiveAlbum`.
  - Atomic sorting reorder transactions with tenant assertion checks.

- **Media Metadata Service (`src/server/media/service.ts`)**:
  - `createMediaMetadata`, `getMediaItemById`, `listMediaByEvent`, `updateMediaMetadata`, `deleteMediaMetadata`.
  - Enforces `allowUserUploads` rules and multi-level visibility filtering.

---

## 5. API Routes Created

- `GET /api/organisations/[slug]/events` - Filtered & paginated event list.
- `POST /api/organisations/[slug]/events` - Create event.
- `GET /api/events/[eventId]` - Event details and media counts.
- `PATCH /api/events/[eventId]` - Update event metadata.
- `DELETE /api/events/[eventId]` - Soft-archive event.
- `GET /api/events/[eventId]/albums` - List albums for event.
- `POST /api/events/[eventId]/albums` - Create album for event.
- `PATCH /api/events/[eventId]/albums/reorder` - Reorder album display order.
- `GET /api/albums/[albumId]` - Album details.
- `PATCH /api/albums/[albumId]` - Update album.
- `DELETE /api/albums/[albumId]` - Soft-archive album.
- `GET /api/events/[eventId]/media` - Paginated media items with album/type filters.
- `POST /api/events/[eventId]/media` - Create media item metadata record.
- `GET /api/albums/[albumId]/media` - Paginated media items in album.
- `GET /api/media/[mediaId]` - Media item metadata details.
- `PATCH /api/media/[mediaId]` - Update media visibility/approval.
- `DELETE /api/media/[mediaId]` - Soft-delete media item.

---

## 6. Frontend Interfaces Created

1. **Events Directory (`/organisations/[slug]/events`)**:
   - Modern glassmorphism UI with search bar, status filters, event date badges, album/media statistics, and cursor pagination.
2. **Event Creation Form (`/organisations/[slug]/events/new`)**:
   - Real-time slug derivation, date/time inputs, visibility scopes, and feature toggles (`allowUserUploads`, `allowDownloads`, `faceSearchEnabled`).
3. **Event Gallery Space (`/organisations/[slug]/events/[eventSlug]`)**:
   - Hero header with event metrics, album tab switcher, photo/video filter, media inspection modal, and album creation dialog.
4. **Organisation Dashboard (`/organisations/[slug]/dashboard`)**:
   - Linked directly to the active events space.

---

## 7. Verification & Testing

- **Vitest Unit & Integration Tests**:
  - `tests/events.test.ts` (5 tests - passed)
  - `tests/albums.test.ts` (4 tests - passed)
  - `tests/media-metadata.test.ts` (4 tests - passed)
  - `tests/event-security.test.ts` (5 tests - passed)
  - Full suite: **16 test files, 63 tests, 100% passing**.
- **Build Verification**:
  - `next build` completed with 0 errors and generated static and dynamic routes successfully.
