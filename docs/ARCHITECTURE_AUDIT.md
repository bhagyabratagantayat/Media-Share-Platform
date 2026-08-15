# Architecture Audit & Baseline Technical Report

**Project:** Organisation Event Media & Digital Memories Platform (Media Share Platform)  
**Phase:** Phase 0 — Project Audit & Production Foundation  
**Date:** August 2026  
**Repository:** `https://github.com/bhagyabratagantayat/Media-Share-Platform.git`  
**Target Workload:** 500+ Concurrent Active Users, Multi-tenant Isolation, Zero Media Bottleneck on API Servers  

---

## 1. Current Technology Stack & Repository State

An exhaustive inspection of the repository was performed. The repository is in an initial clean-slate / greenfield state with a Git remote established and the master implementation plan defined.

| Domain | Current State | Target Production Standard |
|---|---|---|
| **Frontend Framework** | None initialized | Next.js (App Router, TypeScript), Tailwind CSS, Framer Motion, Lucide Icons |
| **Backend Framework** | None initialized | Node.js (TypeScript), Next.js API Routes / Modular Server Actions |
| **Language & Runtime** | TypeScript / Node.js (v20+ LTS) | Strict TypeScript with ESNext / Node.js LTS |
| **Database Engine** | Clean baseline (No legacy schema debt) | PostgreSQL 16+ with `pgvector` extension |
| **Data Access / ORM** | None initialized | Prisma / Drizzle ORM with connection pooling & strict tenant filters |
| **Authentication** | None initialized | Multi-tier: Platform Auth (JWT/Sessions) + Org Access Password (Argon2id) |
| **File Storage** | None connected | S3-Compatible Cloud Object Storage (AWS S3 / Cloudflare R2 / MinIO) |
| **Job Queue & Cache** | None initialized | Redis 7+ with BullMQ for asynchronous background job orchestration |
| **Media Processing** | None initialized | Sharp (libvips) for photos + FFmpeg for multi-bitrate HLS video |
| **Edge & Delivery** | None initialized | Cloudflare CDN / AWS CloudFront with signed URLs & aggressive caching |
| **Deployment / CI/CD** | Git repo configured (`main` branch) | Docker, Stateless Container cluster behind Load Balancer |

---

## 2. Current Architecture vs. Baseline Model

### Current Baseline Representation
```text
[ Git Repository Initialized ]
             │
             ▼
     [ PLAN.md Defined ]
             │
   (Phase 0 Foundation Audit)
```

There is zero legacy code debt, meaning the system can be architected from ground zero to satisfy the strict production criteria:
1. **Zero Media through API Server**: All media uploads and downloads bypass the main application server via presigned S3 URLs and CDN edge nodes.
2. **Stateless API Cluster**: The application server will handle metadata, permissions, sessions, and database queries exclusively.
3. **Dedicated Queue & Worker Fleet**: CPU-heavy media transcoding (video/image/face embeddings) runs completely isolated from HTTP request cycles.

---

## 3. Comprehensive Problem & Risk Identification

Building a multi-tenant media platform capable of handling 500+ simultaneous users without strict architectural guardrails leads to critical failure modes. Below is the risk analysis and preventative architectural strategy.

### 3.1 Security Risks & Mitigations

| Identified Risk | Impact / Attack Vector | Architectural Mitigation |
|---|---|---|
| **Cross-Tenant Data Tampering** | User in Org A alters `organisation_id` or `event_id` in API requests to access Org B's private media. | Enforce multi-tenant middleware and ORM-level tenant query guards. Every database mutation verifies `membership(user_id, org_id)`. Tampering immediately returns HTTP 403 Forbidden. |
| **Exposed Org Access Passwords** | Shared access passwords stored in plaintext or weak MD5 hashes. | Hash all organisation access passwords using **Argon2id** with salt; issue short-lived scoped JWT access tokens upon verification. |
| **Unrestricted File Uploads** | Malicious actors upload executable binaries, SVG scripts (XSS), or zip bombs. | Enforce strict magic-number MIME type validation, file size limits, and strip EXIF scripts during image processing. |
| **Direct S3 Key Manipulation** | Users guess S3 URLs or forge paths to access private media. | Object storage buckets are private. Access is mediated exclusively through signed, time-limited CDN/S3 URLs with permission verification. |
| **Biometric Privacy Violations** | Storing unconsented or raw facial biometrics violates privacy regulations (GDPR/DPDP). | Explicit biometric consent required before selfie upload; store only 512-dim mathematical vectors; provide 1-click biometric profile deletion. |
| **API Abuse & Brute Force** | Attackers brute-force organisation access codes or spam upload sessions. | Redis-backed distributed rate limiting (strict on auth/search, moderate on API read endpoints). |

### 3.2 Performance Risks & Mitigations

| Identified Risk | Impact / Bottleneck | Architectural Mitigation |
|---|---|---|
| **API Server Memory Starvation** | Uploading 500MB+ videos through Node.js fills server RAM, causing crash loops under concurrency. | Direct-to-Storage Presigned Multipart Uploads. The API server only generates signed upload URLs; binary streams flow directly from browser to S3. |
| **Gallery Latency / Bandwidth Spikes** | Loading 100+ raw 10MB original photos in galleries exhausts client bandwidth and crashes mobile browsers. | Background worker generates 400px WebP thumbnails and 1080p web-optimized derivatives. Gallery loads thumbnails with lazy loading & virtual scrolling. |
| **Synchronous Media Processing** | Running FFmpeg or Sharp inside HTTP POST handlers locks event loops and triggers HTTP 504 timeouts. | Decouple processing completely using Redis + BullMQ workers. API immediately returns `PROCESSING` status. |
| **Database `SELECT *` & Missing Indexes** | Unindexed foreign keys and large unbounded queries choke PostgreSQL under 500+ active users. | Composite indexes on `(organisation_id, event_date)`, `(organisation_id, status)`. Mandatory cursor-based pagination. |
| **Database Connection Exhaustion** | 500 concurrent users creating new DB connections exhaust PostgreSQL connection pool. | PostgreSQL connection pooling via PgBouncer / Prisma connection manager tuned to worker and API concurrency limits. |

### 3.3 Reliability & Failure Recovery Risks

| Identified Risk | Impact | Architectural Mitigation |
|---|---|---|
| **Network Interruption on Large Uploads** | A 2GB video upload fails at 98%, forcing the user to restart from 0%. | S3 Multipart resumable uploads with chunk tracking and client-side retry logic. |
| **Worker Crash During Transcoding** | Video transcoding job crashes mid-process, leaving media stuck in `PROCESSING`. | Idempotent, retryable BullMQ jobs with exponential backoff, dead-letter queues, and job timeout recovery. |
| **Database / Redis Outages** | Temporary network partitions cause complete service disruption. | Health check endpoints (`/api/health`), automatic reconnection retries, and graceful degradation. |

---

## 4. Architectural Guardrails for Future Phases

1. **Isolation Rule**: No database query shall execute without an explicit `organisation_id` parameter where tenant data is involved.
2. **Bandwidth Rule**: No photo or video binary stream shall be buffered or proxied through the Node.js/Next.js API server.
3. **Worker Decoupling**: All image compression, video transcoding, and facial recognition tasks must execute inside background BullMQ workers.
4. **Delivery Rule**: All public and authorized media assets must be served via CDN with caching headers and WebP/AVIF/HLS optimizations.
