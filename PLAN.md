# Antigravity Production Implementation Plan

## PROJECT OBJECTIVE

Transform the existing project into a **production-ready multi-organisation event media platform** capable of safely handling:

* 500+ concurrent active users
* Large photo galleries
* Multiple simultaneous uploads
* Multiple simultaneous downloads
* Large video files
* Large event galleries
* Automatic image/video compression
* Background media processing
* Organisation-level data isolation
* Real-time upload/processing status
* High database traffic
* CDN-based media delivery
* Reliable failure recovery

The system must be designed so that **photos and videos do NOT pass through the main application server unnecessarily**.

The application server should primarily handle:

* Authentication
* Authorisation
* API requests
* Metadata
* Permissions
* Upload session creation
* Download authorisation
* Search
* Admin operations

Large media files should be handled by object storage and CDN.

---

# IMPORTANT DEVELOPMENT RULE

Do NOT rewrite the entire application at once.

Implement the project in the following phases.

After every phase:

1. Run the application.
2. Run database migrations.
3. Run automated tests.
4. Test authentication.
5. Test API permissions.
6. Test upload/download.
7. Check logs.
8. Check performance.
9. Fix errors.
10. Only then continue to the next phase.

Do not break working functionality while adding new functionality.

Before modifying existing code:

* Inspect the existing project structure.
* Identify the current framework.
* Identify the database.
* Identify existing authentication.
* Identify existing API routes.
* Identify existing storage implementation.
* Identify existing frontend pages.
* Reuse working code where appropriate.
* Do not blindly replace the existing architecture.

---

# PHASE 0 — PROJECT AUDIT

Before writing new code, analyse the entire repository.

Create a technical report containing:

### Frontend

* Framework
* Routing
* Components
* State management
* API integration
* Authentication flow
* Existing gallery implementation

### Backend

* Framework
* API architecture
* Authentication
* Authorisation
* Middleware
* Error handling
* File upload handling
* Background jobs

### Database

* Database engine
* Tables
* Relations
* Indexes
* Existing migrations
* Potential performance problems

### Storage

Determine:

* Where images are stored
* Where videos are stored
* Whether files pass through the backend
* Whether CDN exists
* Whether thumbnails exist

### Security

Identify:

* Authentication vulnerabilities
* Authorisation vulnerabilities
* File upload vulnerabilities
* Exposed secrets
* Missing rate limiting
* Missing validation

### Performance

Identify:

* N+1 queries
* Large API responses
* Missing indexes
* Uncached queries
* Direct media serving from backend
* Blocking image/video processing

Do not modify functionality during this audit.

Create:

`ARCHITECTURE_AUDIT.md`

---

# PHASE 1 — FOUNDATION & MULTI-TENANCY

Implement the organisation architecture first.

## Entities

Create/verify:

* User
* Organisation
* OrganisationMember
* Role
* OrganisationAccessSettings
* Event
* Album
* Media

Every organisation-owned resource must have:

`organisation_id`

Examples:

```text
organisations
organisation_members
events
albums
media
media_approvals
audit_logs
```

## Critical Rule

Every request must validate:

```text
Authenticated User
        ↓
Organisation Membership
        ↓
Role
        ↓
Resource Organisation
        ↓
Permission
```

Never trust an organisation ID supplied by the frontend.

Prevent:

```text
Organisation A user
        ↓
manually changes organisationId
        ↓
access Organisation B
```

This must fail with HTTP 403.

## Roles

Implement:

```text
PLATFORM_ADMIN
ORGANISATION_OWNER
ORGANISATION_ADMIN
SOCIAL_MEDIA_MANAGER
SOCIAL_MEDIA_MEMBER
MODERATOR
USER
```

---

# PHASE 2 — AUTHENTICATION & ORGANISATION ACCESS

Implement:

## Platform authentication

* Registration
* Login
* Logout
* Email verification
* Password reset
* Secure session management

## Organisation

Organisation can:

* Create account
* Configure profile
* Create access password
* Change access password
* Rotate access password
* Disable access password

Never store access passwords in plaintext.

Store secure hashes.

## User flow

```text
Platform
   ↓
Search Organisation
   ↓
Select Organisation
   ↓
Organisation Access Password
   ↓
User Login/Register
   ↓
Organisation Portal
```

A shared organisation access password is an access gate, NOT the user's identity.

---

# PHASE 3 — EVENT & ALBUM SYSTEM

Implement:

## Events

Fields:

```text
id
organisation_id
name
slug
description
event_date
location
cover_media_id
visibility
allow_user_uploads
allow_downloads
face_search_enabled
created_by
created_at
updated_at
```

## Albums

Every album belongs to an organisation and optionally an event.

Support:

* Create
* Edit
* Delete
* Reorder
* Cover image

Example:

```text
Independence Day 2026
 ├── Flag Hoisting
 ├── Cultural Program
 ├── Audience
 ├── Prize Distribution
 └── Official Photos
```

---

# PHASE 4 — MEDIA METADATA ARCHITECTURE

Do not store binary media inside PostgreSQL.

PostgreSQL should store metadata.

Example:

```text
media

id
organisation_id
event_id
album_id
uploader_id
media_type
status
visibility
face_search_enabled
original_storage_key
optimized_storage_key
thumbnail_storage_key
streaming_storage_key
original_size
optimized_size
mime_type
width
height
duration
codec
processing_status
created_at
updated_at
```

Database = metadata.

Object storage = actual files.

CDN = delivery.

---

# PHASE 5 — PRODUCTION STORAGE ARCHITECTURE

Use:

```text
Browser
   ↓
Application API
   ↓
Create Upload Session
   ↓
Signed Upload URL
   ↓
Object Storage
```

Do NOT upload large videos through:

```text
Browser → Node.js → Object Storage
```

unless there is a specific reason.

Instead:

```text
Browser
   ↓
Signed URL / Multipart Upload
   ↓
S3-compatible Object Storage
```

This prevents the application server from becoming a bottleneck.

Recommended storage:

* AWS S3
* Cloudflare R2
* Google Cloud Storage
* Azure Blob Storage

Use whichever is selected for deployment.

---

# PHASE 6 — LARGE FILE / MULTIPART UPLOAD

For large videos implement multipart/resumable upload.

Requirements:

* Chunked uploads
* Upload progress
* Retry failed chunks
* Resume interrupted uploads
* Cancel upload
* Parallel chunk upload
* Upload session expiration
* Server-side completion verification

Flow:

```text
Select Video
     ↓
Create Upload Session
     ↓
Split Into Chunks
     ↓
Upload Chunks Directly
     ↓
Complete Multipart Upload
     ↓
Create Media Record
     ↓
Queue Processing
```

If internet disconnects:

```text
Already uploaded chunks
        ↓
Keep them
        ↓
Resume remaining chunks
```

Do not force the user to restart a 2 GB upload from zero.

---

# PHASE 7 — MEDIA PROCESSING QUEUE

Never compress large media inside the HTTP request.

Bad:

```text
POST /upload
   ↓
Upload
   ↓
Compress 500 MB video
   ↓
Wait
   ↓
HTTP response
```

Good:

```text
Upload
   ↓
Store original
   ↓
Create processing job
   ↓
Return immediately
   ↓
Background worker
   ↓
Compression
   ↓
Thumbnail
   ↓
Streaming version
   ↓
Update database
```

Use:

* Redis
* BullMQ
* Or equivalent reliable job queue

Jobs:

```text
IMAGE_PROCESS
VIDEO_PROCESS
THUMBNAIL_GENERATE
FACE_PROCESS
MEDIA_SCAN
NOTIFICATION
```

---

# PHASE 8 — AUTOMATIC IMAGE COMPRESSION

When an image is uploaded:

```text
Original
 ↓
Validate
 ↓
Process
 ↓
Generate optimized version
 ↓
Generate thumbnail
 ↓
Store
```

Requirements:

* Reduce file size
* Preserve visual quality
* Preserve resolution when practical
* Generate responsive sizes
* Generate WebP/AVIF where appropriate
* Keep original when plan allows

Do not repeatedly compress the same file.

Track:

```text
original_size
optimized_size
compression_ratio
```

---

# PHASE 9 — AUTOMATIC VIDEO COMPRESSION

Implement FFmpeg-based background processing.

Requirements:

* Preserve resolution whenever possible
* Preserve aspect ratio
* Preserve frame rate where practical
* Preserve audio quality
* Reduce bitrate intelligently
* Avoid noticeable quality degradation
* Generate streaming-friendly versions
* Generate thumbnails
* Generate preview versions

Do not promise mathematically lossless compression.

Use:

**High-quality / visually lossless optimisation where practical.**

Support multiple output profiles when required.

Example:

```text
Original 4K
    ↓
4K high-quality version
    ↓
1080p streaming version
    ↓
720p streaming version
```

The original should remain available according to the organisation's storage plan.

---

# PHASE 10 — CDN ARCHITECTURE

This is essential for 500+ users.

Do NOT make the backend serve every image/video.

Use:

```text
Object Storage
      ↓
CDN
      ↓
Users
```

Examples:

* Cloudflare CDN
* CloudFront
* equivalent CDN

Gallery images should be cached.

Video delivery should use CDN/streaming URLs.

The application server should mostly provide metadata and signed access URLs.

---

# PHASE 11 — CACHING

Use caching carefully.

Cache:

* Organisation list
* Organisation profile
* Event list
* Event metadata
* Album metadata
* Gallery pagination metadata
* Public media metadata
* User permissions where appropriate

Do NOT blindly cache sensitive data.

Recommended:

```text
Browser Cache
      ↓
CDN Cache
      ↓
Redis Cache
      ↓
Database
```

Cache invalidation must happen when:

* Event changes
* Media is deleted
* Media visibility changes
* Approval status changes
* Organisation settings change

Never allow deleted/private media to remain publicly accessible because of stale caching.

---

# PHASE 12 — DATABASE PERFORMANCE

Add proper indexes.

Examples:

```text
events:
INDEX(organisation_id)
INDEX(organisation_id, event_date)

media:
INDEX(organisation_id)
INDEX(event_id)
INDEX(album_id)
INDEX(uploader_id)
INDEX(status)
INDEX(created_at)

organisation_members:
INDEX(user_id)
INDEX(organisation_id)
UNIQUE(user_id, organisation_id)
```

Use composite indexes based on real query patterns.

Avoid:

```text
SELECT *
```

for large datasets.

Use pagination.

Never load 10,000 media records in one API response.

---

# PHASE 13 — GALLERY PERFORMANCE

Never send original 10 MB photos to the gallery.

Use:

```text
Gallery
 ↓
Thumbnail
 ↓
Optimized image
 ↓
Original only when requested
```

Implement:

* Lazy loading
* Pagination/infinite scrolling
* Responsive image sizes
* CDN caching
* Thumbnail generation
* Virtualised lists where appropriate

Example:

```text
100,000 photos
```

The browser should only receive the small subset currently visible.

---

# PHASE 14 — REAL-TIME UPLOAD STATUS

Provide real-time processing status.

Example:

```text
Uploading
████████░░ 80%

Upload Complete

Processing
██████░░░░ 60%

Optimizing Video...

Generating Thumbnail...

Ready ✓
```

Use:

* WebSocket
* Server-Sent Events
* or reliable polling

Do not keep an HTTP request open for long-running media processing.

---

# PHASE 15 — CONCURRENT USER ARCHITECTURE

Target:

**500+ concurrent users**

Design the application as stateless wherever possible.

Multiple application instances should be able to run simultaneously.

```text
                 Load Balancer
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       API #1       API #2      API #3
          │           │           │
          └───────────┼───────────┘
                      ▼
                   Redis
                      │
                  PostgreSQL
                      │
                Object Storage
                      │
                     CDN
```

Any API server should be able to handle any authenticated request.

Do not store important session state only in local server memory.

---

# PHASE 16 — DATABASE CONNECTION POOLING

Configure PostgreSQL connection pooling.

Do not create a new database connection for every request.

Use a connection pool and tune it based on actual infrastructure.

If traffic grows significantly, consider:

* PgBouncer
* Read replicas
* Database scaling
* Query optimisation

Do not add read replicas prematurely.

Measure first.

---

# PHASE 17 — RATE LIMITING

Protect APIs.

Different limits for:

```text
Login
Password attempts
Organisation access verification
Upload session creation
Face search
Search
Download URL generation
Admin APIs
```

Example concept:

```text
Login → strict
Search → moderate
Gallery → high
Face search → strict
Admin → strict
```

Return proper HTTP 429 responses when limits are exceeded.

---

# PHASE 18 — DOWNLOAD ARCHITECTURE

Do not proxy large downloads through Node.js.

Instead:

```text
User
 ↓
Request Download Permission
 ↓
API verifies permission
 ↓
Generate short-lived signed URL
 ↓
CDN/Object Storage
 ↓
User
```

This allows many users to download simultaneously without exhausting application-server bandwidth.

For very large files:

* Support resumable downloads where infrastructure allows
* Use CDN
* Use appropriate cache headers

---

# PHASE 19 — UPLOAD/DOWNLOAD ISOLATION

Uploads and downloads must not compete for application-server resources.

Bad:

```text
API Server
 ├── Upload videos
 ├── Compress videos
 ├── Serve videos
 ├── Serve images
 └── API requests
```

Good:

```text
API Server
 └── Authentication + Metadata + Permissions

Object Storage
 └── Files

CDN
 └── Downloads

Workers
 └── Compression + Processing
```

This separation is one of the most important requirements for 500+ concurrent users.

---

# PHASE 20 — USER UPLOAD APPROVAL

Normal user:

```text
Upload
 ↓
Object Storage
 ↓
Media status = PROCESSING
 ↓
Compression
 ↓
Media status = PENDING_APPROVAL
 ↓
Admin Review
 ↓
APPROVED
 ↓
Visible
```

Do not expose media before the appropriate approval state.

---

# PHASE 21 — SOCIAL MEDIA TEAM BULK UPLOAD

For official team uploads:

```text
Create Event
 ↓
Bulk Upload
 ↓
Multipart Upload
 ↓
Object Storage
 ↓
Processing Queue
 ↓
Compression
 ↓
Thumbnail
 ↓
Optional Face Processing
 ↓
Publish
```

Allow:

* 100s of photos
* Large video batches
* Retry
* Resume
* Batch cancellation
* Batch progress
* Batch failure reporting

---

# PHASE 22 — FACE SEARCH

Implement this only after the core media system is stable.

Architecture:

```text
User
 ↓
Consent
 ↓
Selfie
 ↓
Face Worker
 ↓
Embedding
 ↓
Search permitted media
 ↓
Matching results
```

Face processing must be asynchronous.

Never make the main API server process hundreds of face images synchronously.

---

# PHASE 23 — SECURITY TESTING

Before production, test:

### Authentication

* Brute force
* Session hijacking
* Password reset
* Token/session expiration

### Authorisation

Try:

```text
User A → Organisation B
User → Admin API
Team member → Owner API
Organisation A → Organisation B media
```

Everything unauthorised must return 401/403.

### Upload

Test:

* Invalid MIME
* Malicious files
* Huge files
* Fake extensions
* Duplicate uploads

### Storage

Ensure users cannot modify storage paths manually to access another organisation's files.

---

# PHASE 24 — OBSERVABILITY

Production software needs visibility.

Implement:

## Application logs

Track:

* API errors
* Authentication failures
* Upload failures
* Processing failures
* Database errors

## Metrics

Track:

* Active users
* Requests/second
* API latency
* Error rate
* Upload throughput
* Download traffic
* Queue length
* Processing time
* Database performance
* Cache hit ratio
* Storage usage

## Alerts

Alert on:

* High error rate
* Queue backlog
* Storage failure
* Database failure
* High latency
* Worker failure
* Unusual authentication activity

---

# PHASE 25 — LOAD TESTING

Do not claim the platform supports 500 users simply because it works locally.

Create a load-testing environment.

Test at least:

### Test A

500 concurrent users browsing events.

### Test B

500 users opening galleries.

### Test C

100+ users downloading media simultaneously.

### Test D

Multiple Social Media Team members uploading simultaneously.

### Test E

Large video uploads while users browse galleries.

### Test F

Media processing backlog.

### Test G

Database-heavy event search.

### Test H

Mixed workload:

```text
500 users
+
uploads
+
downloads
+
gallery browsing
+
search
+
admin operations
```

Measure:

* p50 latency
* p95 latency
* p99 latency
* error rate
* throughput
* CPU
* memory
* database connections
* Redis usage
* queue length
* storage throughput

Use realistic file sizes.

---

# PHASE 26 — FAILURE TESTING

Test what happens when:

* Database temporarily disconnects
* Redis restarts
* Storage upload fails
* Video worker crashes
* Network disconnects during upload
* CDN temporarily fails
* User closes browser during upload
* Processing job fails
* Duplicate job is created

The system must recover safely.

Jobs should be:

**Retryable + Idempotent**

A failed video-processing job should not corrupt the original file.

---

# PHASE 27 — BACKUP & RECOVERY

Implement:

### Database

* Automated backups
* Point-in-time recovery if supported
* Backup verification

### Object Storage

* Versioning where appropriate
* Lifecycle policies
* Replication according to requirements

### Disaster Recovery

Document:

```text
Database Recovery
Storage Recovery
Application Recovery
Queue Recovery
```

Create:

`DISASTER_RECOVERY.md`

---

# PHASE 28 — STORAGE LIFECYCLE

Storage will become the largest cost.

Implement lifecycle policies.

Example:

```text
Active Media
 ↓
Frequently Accessed
 ↓
Older Media
 ↓
Archive Storage
```

Organisation plans can control:

* Storage limit
* Original retention
* Archive duration
* Deleted media retention
* Video retention

Do not automatically delete user data without a clearly defined retention policy.

---

# PHASE 29 — PRODUCTION DEPLOYMENT

Use separate environments:

```text
Development
     ↓
Staging
     ↓
Production
```

Never test major migrations directly on production first.

Production should have:

* HTTPS
* Secure environment variables
* Database backups
* CDN
* Object storage
* Redis
* Worker instances
* Monitoring
* Error tracking
* Logging
* Rate limiting

---

# PHASE 30 — FINAL ARCHITECTURE

Target architecture:

```text
                         INTERNET
                            │
                            ▼
                     CDN / WAF / DNS
                            │
                            ▼
                     Load Balancer
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           API #1         API #2        API #3
              │             │             │
              └─────────────┼─────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
          PostgreSQL      Redis        Auth System
              │             │
              │             ▼
              │       Job Queue
              │             │
              │      ┌──────┼──────┐
              │      ▼      ▼      ▼
              │    Image  Video   Face
              │    Worker Worker Worker
              │      │      │      │
              └──────┴──────┴──────┘
                            │
                            ▼
                     Object Storage
                            │
                            ▼
                           CDN
                            │
                            ▼
                           USERS
```

---

# PHASE 31 — ANTIGRAVITY EXECUTION ORDER

Give Antigravity these instructions sequentially.

## TASK 01

Audit the existing repository.

Do not change functionality.

Create:

`ARCHITECTURE_AUDIT.md`

---

## TASK 02

Implement/fix:

* Database schema
* Organisation isolation
* Roles
* Authentication
* Authorisation

Run tests.

---

## TASK 03

Implement:

* Organisation creation
* Organisation directory
* Organisation access password
* Organisation dashboard

Run tests.

---

## TASK 04

Implement:

* Events
* Albums
* Media metadata
* Gallery

Run tests.

---

## TASK 05

Replace direct application-server media uploads with:

**Signed multipart object-storage uploads.**

Do not proceed until large-file upload works correctly.

---

## TASK 06

Implement:

* Background queue
* Image compression
* Video processing
* Thumbnail generation
* Processing status

---

## TASK 07

Implement:

* CDN
* Optimized image delivery
* Video delivery
* Signed URLs
* Download permissions

---

## TASK 08

Implement:

* Redis caching
* Cache invalidation
* Database indexes
* Query optimisation
* Pagination

---

## TASK 09

Implement:

* Social Media Team
* Permissions
* Bulk upload
* Batch processing
* Audit logs

---

## TASK 10

Implement:

* User uploads
* Public/Face processing options
* Approval system
* Reports

---

## TASK 11

Implement:

* Real-time upload status
* Processing status
* Notifications

---

## TASK 12

Implement:

* Face discovery
* Consent
* Face processing queue
* Face profile deletion
* Privacy controls

---

## TASK 13

Implement production security:

* Rate limiting
* Input validation
* File validation
* Secure headers
* CSRF protection where applicable
* Session security
* API authorisation
* Audit logging

---

## TASK 14

Implement observability:

* Structured logging
* Error tracking
* Metrics
* Health endpoints
* Worker monitoring

---

## TASK 15

Perform load testing.

Target:

**500+ concurrent users**

Do not simply test 500 HTTP requests.

Test realistic mixed workloads.

---

## TASK 16

Fix all bottlenecks discovered by load testing.

Do not increase server size blindly.

First identify whether the bottleneck is:

* CPU
* Memory
* Database
* Network
* Object storage
* CDN
* Redis
* Worker capacity
* Connection pool
* API design

---

## TASK 17

Perform security testing.

Specifically test cross-organisation access.

---

## TASK 18

Perform failure/recovery testing.

Verify:

* Upload resume
* Processing retry
* Worker restart
* Database recovery
* Storage failure handling

---

## TASK 19

Prepare production deployment.

Create:

```text
DEPLOYMENT.md
SECURITY.md
ARCHITECTURE.md
DISASTER_RECOVERY.md
LOAD_TEST_REPORT.md
API.md
```

---

# PRODUCTION ACCEPTANCE CRITERIA

Do not mark the project production-ready until all of these are true:

* [ ] Multiple organisations work independently
* [ ] Cross-organisation access is impossible
* [ ] Organisation roles work correctly
* [ ] Organisation access password works
* [ ] Social Media Team accounts work
* [ ] Events work
* [ ] Albums work
* [ ] Bulk upload works
* [ ] Large video upload works
* [ ] Resumable upload works
* [ ] Automatic image compression works
* [ ] Automatic video compression works
* [ ] Background processing works
* [ ] CDN delivery works
* [ ] Downloads do not overload API servers
* [ ] Gallery uses thumbnails/optimized media
* [ ] Database pagination works
* [ ] Database indexes are verified
* [ ] Redis caching works
* [ ] Cache invalidation works
* [ ] User uploads require approval
* [ ] Face processing is isolated and consent-based
* [ ] Rate limiting works
* [ ] Audit logging works
* [ ] Error monitoring works
* [ ] Automated backups work
* [ ] Failure recovery works
* [ ] 500+ concurrent-user load test passes
* [ ] No critical security vulnerabilities remain
* [ ] Production deployment documentation exists

# MOST IMPORTANT ARCHITECTURAL RULE

The final system must follow:

**API handles control.
Object storage handles files.
CDN handles delivery.
Workers handle processing.
Redis handles caching/queues.
PostgreSQL handles structured data.
Load balancer handles application traffic.**

Do not build a system where the Node.js/Next.js application server receives, compresses and serves every large photo/video.

That architecture may work during development but will become the bottleneck when hundreds of users simultaneously upload, browse and download event media.
