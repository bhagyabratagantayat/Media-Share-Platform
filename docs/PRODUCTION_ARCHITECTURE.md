# Production Target Architecture Blueprint

**Project:** Organisation Event Media & Digital Memories Platform (Media Share Platform)  
**Phase:** Phase 0 — Project Audit & Production Foundation  
**File:** `docs/PRODUCTION_ARCHITECTURE.md`  

---

## 1. High-Level Target Production Architecture

```text
                         USERS
                           │
                           ▼
                     CDN / WAF (Cloudflare)
                           │
                           ▼
                    Load Balancer (Nginx / Cloud LB)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           API #1        API #2       API #3 (Stateless Next.js/Node.js)
              │            │            │
              └────────────┼────────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        PostgreSQL       Redis       Authentication
        (+ pgvector)   (BullMQ)      (Argon2id + JWT)
             │             │
             │             ▼
             │         Job Queue
             │             │
             │      ┌──────┼──────┐
             │      ▼      ▼      ▼
             │   Image   Video   Face
             │   Worker  Worker  Worker
             │   (Sharp) (FFmpeg)(ONNX)
             │      │      │      │
             └──────┴──────┴──────┘
                           │
                           ▼
                    Object Storage (S3 / R2 / MinIO)
                           │
                           ▼
                          CDN (Edge Cache)
                           │
                           ▼
                         USERS
```

---

## 2. Component Responsibilities Matrix

| Component | Responsibility & Design Guardrails |
|---|---|
| **API Server Cluster (Node.js / Next.js)** | **Control Plane Only**. Manages authentication, RBAC, organisation scoping, DB metadata CRUD, presigned upload URL signing, search indexing, moderation flags, and real-time status notifications. **Never handles media file binary streams.** |
| **Object Storage (AWS S3 / Cloudflare R2)** | **Binary Data Storage**. Holds raw originals, WebP/AVIF compressed variants, thumbnails, and HLS streaming `.ts` segments in isolated tenant directory hierarchies. |
| **Edge CDN / WAF (Cloudflare)** | **Delivery & Edge Caching**. Globally caches thumbnails, display variants, and HLS playlists. Enforces DDoS protection, SSL termination, and rate limits. |
| **PostgreSQL + `pgvector`** | **Relational & Vector Data Store**. Stores structured metadata, organisation permissions, events, albums, audit logs, and 512-dim facial vectors with HNSW cosine similarity indexes. |
| **Redis & BullMQ** | **Job Queue & High-Speed Cache**. Coordinates asynchronous media processing jobs, rate limiting counters, session ticket caches, and SSE/WebSocket real-time event pub/sub. |
| **Worker Fleet** | **Compute-Heavy Background Processing**: <br>• **Image Worker**: Sharp resizing, EXIF auto-orientation, WebP/AVIF generation.<br>• **Video Worker**: FFmpeg adaptive multi-bitrate HLS encoding and poster extraction.<br>• **Face AI Worker**: Face detection, bounding-box calculation, and 512-dim feature vector generation. |

---

## 3. Multi-Tenant Isolation Strategy

The platform operates as a multi-tenant SaaS serving thousands of independent organisations:

```text
PLATFORM
   │
   ├── Organisation A (e.g. Bhubaneswar Engineering College)
   │     ├── Admin
   │     ├── Social Media Team
   │     ├── Users / Students
   │     ├── Events
   │     └── Media
   │
   ├── Organisation B (e.g. Tech University)
   │     ├── Admin
   │     ├── Social Media Team
   │     ├── Users
   │     ├── Events
   │     └── Media
   │
   └── Organisation C (e.g. Enterprise Corp)
         ├── Admin
         ├── Social Media Team
         ├── Users
         ├── Events
         └── Media
```

### Critical Security Isolation Invariants:
1. **Discriminator Column (`organisation_id`)**: Present on every tenant entity (`events`, `albums`, `media_items`, `audit_logs`, `organisation_members`).
2. **Middleware Verification**: Every API request extracts and validates the user's role and membership inside the requested organisation before querying the database.
3. **Cross-Tenant Attack Prevention**: If a user authenticated for Organisation A attempts to view, modify, or delete a resource belonging to Organisation B by manipulating the `organisation_id` or resource UUID in the request, the API must fail immediately with **HTTP 403 Forbidden**.

---

## 4. Scalability Target: 500+ Concurrent Active Users

To effortlessly handle 500+ simultaneous users browsing galleries, downloading media, and uploading bulk event coverage:

1. **Stateless API Design**: API nodes do not store session state in local RAM. All session state is managed via cryptographically signed JWTs and Redis. Any API node can handle any incoming request.
2. **Zero Media Proxying**: Uploads and downloads stream directly between the client browser and Object Storage / CDN. An API node consuming 50MB RAM can coordinate hundreds of active upload sessions without memory starvation.
3. **Database Connection Pooling**: PostgreSQL connection limits are managed via connection pooling (PgBouncer/Prisma connection pool) to prevent connection exhaustion during high-concurrency spikes.
4. **Hierarchical Caching**:
   - **Browser Cache**: Immutable media variants cached for 1 year with `Cache-Control: public, max-age=31536000, immutable`.
   - **CDN Cache**: Edge caching for all public event thumbnails and optimized display variants.
   - **Redis Cache**: Frequently accessed event metadata and organisation profile caches with instant invalidation on mutation.
5. **Cursor-Based Pagination**: Galleries load media chunks of 30-50 items using index-backed keyset pagination (`WHERE id < :cursor`).

---

## 5. Planned 16-Phase Implementation Roadmap

The project will be built incrementally according to the following 16 phases:

- **Phase 0**: Audit + Architecture & Baseline Preparation (Current Phase)
- **Phase 1**: Database Foundation + Multi-Tenancy + RBAC Roles
- **Phase 2**: Authentication + Organisation Access Password Gate
- **Phase 3**: Events + Albums + Media Metadata Hierarchy
- **Phase 4**: Production Object Storage + Direct Signed Uploads
- **Phase 5**: Multipart / Resumable Large-File Upload Engine
- **Phase 6**: Background Processing + Image & Video Compression Workers
- **Phase 7**: CDN + Optimized Media Delivery + Signed Downloads
- **Phase 8**: Social Media Team + Bulk Upload Studio
- **Phase 9**: Normal-User Uploads + Community Moderation System
- **Phase 10**: Redis Caching + Database Query Optimisation
- **Phase 11**: Real-Time Upload & Processing Status (SSE/WebSocket)
- **Phase 12**: AI Face-Based Photo Discovery ("Find My Photos" via `pgvector`)
- **Phase 13**: Production Security Hardening & Rate Limiting
- **Phase 14**: Observability, Structured Logging & Worker Monitoring
- **Phase 15**: Load Testing for 500+ Concurrent Users (Mixed Workloads)
- **Phase 16**: Production Deployment, Storage Lifecycles & Disaster Recovery
