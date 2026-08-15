# Phase 2 Implementation Report: Authentication, Organisation Creation & Secure Organisation Access

**Date:** 2026-08-15  
**Milestone:** Production Foundation & Access Gate  
**Status:** COMPLETED & VERIFIED  

---

## 1. Authentication Architecture

The authentication subsystem is implemented using server-side Next.js route handlers with stateless cryptographic tokens (Jose JWT) and OWASP-recommended **Argon2id** password hashing.

- **Cryptographic Scheme:** Argon2id (`m=65536, t=3, p=4`), generating 128-bit cryptographically secure salts.
- **Session Architecture:** Stateless JSON Web Tokens (JWT) signed via HMAC-SHA256 (`HS256`) with a 7-day lifetime.
- **Storage:** Stored in `HttpOnly`, `Secure` (production), `SameSite=Lax` cookies named `media_platform_session`.
- **Zero LocalStorage:** No session tokens, passwords, or hashes are stored in browser localStorage or sessionStorage.

---

## 2. Registration Flow

1. **Client Submission:** User submits `name`, `email`, `password`, and `confirmPassword` via `/register` or `POST /api/auth/register`.
2. **Server-Side Validation:**
   - Name validation ($\ge 2$ characters).
   - Email format validation and lowercase trimming (`email.toLowerCase().trim()`).
   - Password strength validation ($\ge 8$ characters).
   - Password confirmation match verification.
3. **Collision Check:** Case-insensitive lookup against `users` table. Throws `ConflictError` (HTTP 409) on duplication.
4. **Hashing & Persistence:** Passwords hashed with Argon2id; `User` created with `status: ACTIVE`.
5. **Session Issuance & Audit:** Emits `USER_REGISTERED` in `audit_logs` and sets the `HttpOnly` session cookie on the response.

---

## 3. Login & Logout Flow

- **Login (`POST /api/auth/login`):**
  - Normalizes email address.
  - Queries `User` record; verifies `status` is not `SUSPENDED` (throws HTTP 403) or `DELETED` (throws HTTP 401).
  - Performs constant-time Argon2id password verification.
  - Updates `lastLoginAt` timestamp.
  - Logs `USER_LOGIN` audit trail with IP and User Agent.
  - Issues signed session JWT in `HttpOnly` cookie.
- **Logout (`POST /api/auth/logout`):**
  - Records `USER_LOGOUT` in `audit_logs`.
  - Deletes `media_platform_session` cookie immediately.

---

## 4. Password Reset Architecture

- **Request (`POST /api/auth/forgot-password`):**
  - Normalizes email and checks user account.
  - Generates 32-byte cryptographic random token.
  - Stores SHA-256 hash of token in `password_reset_tokens` table with 1-hour expiration.
  - Returns identical success messages regardless of user existence to prevent user enumeration attacks.
- **Reset (`POST /api/auth/reset-password`):**
  - Hashes incoming raw token with SHA-256 and searches for active, unused record.
  - Re-hashes new password using Argon2id.
  - Executes database transaction updating user's `passwordHash` and marking token `usedAt: new Date()`.
  - Records `PASSWORD_RESET_COMPLETED` audit log.

---

## 5. Organisation Creation (Transactional Integrity)

The organisation onboarding workflow is fully atomic within a PostgreSQL database transaction (`prisma.$transaction`):

```text
Incoming Payload
       ↓
Validate Slug & Name
       ↓
Check Slug Uniqueness
       ↓
Hash Org Access Password (Argon2id)
       ↓
BEGIN TRANSACTION
  1. Create Organisation (Name, Slug, Type, Location, Privacy)
  2. Create OrganisationAccessSettings (Hash, Enabled, accessVersion: 1)
  3. Create OrganisationMember (User ID, Role: ORGANISATION_OWNER)
  4. Create AuditLog (ORGANISATION_CREATED)
COMMIT TRANSACTION
```

If any step fails, the entire transaction rolls back, preventing half-configured organisations.

---

## 6. Organisation Access Password & Scoped Access Tickets

Colleges and institutions require a shared entrance password for students/members to enter their event memory space without needing administrative accounts.

- **Decoupled Passwords:** Owner account password $\ne$ Organisation access password.
- **Argon2id Protection:** Shared passwords are never stored in plaintext and never logged.
- **Access Verification (`POST /api/organisations/[slug]/access`):**
  - Validates password hash with Argon2id.
  - Signs a scoped `OrgAccessPassToken` containing `orgId` and `accessVersion`.
  - Sets a scoped cookie (`media_org_pass_<orgId>`) valid for 24 hours.
  - Emits `ORGANISATION_ACCESS_GRANTED` in audit logs.

---

## 7. Instant Session Invalidation (Password Rotation)

When an organisation administrator rotates or updates the access password:
1. New password is saved as an Argon2id hash.
2. If `invalidateSessions: true` is selected, `accessVersion` is incremented (e.g. from `1` to `2`).
3. Any existing access pass tokens issued with `version: 1` will fail verification on the next request and return HTTP 403, forcing guests to enter the newly rotated password.
4. Database audit log records `ORGANISATION_ACCESS_PASSWORD_ROTATED`.

---

## 8. Multi-Tenant Isolation & Role-Based Access Control (RBAC)

Tenant boundaries are enforced strictly on every server-side operation:
1. **Tenant Assertion:** `assertTenantOwnership(expectedOrgId, targetResourceOrgId)` guarantees resources are never manipulated across tenant boundaries.
2. **Membership Check:** Server checks `organisation_members` for the caller's role (`ORGANISATION_OWNER`, `ORGANISATION_ADMIN`, etc.).
3. **Guest Verification:** If user is not an internal member, server verifies valid `OrgAccessPassToken` matching the active `accessVersion`.
4. **Separation of Platform vs Org Authority:** `PLATFORM_ADMIN` manages the global SaaS instance, while `ORGANISATION_OWNER` controls only their tenant space.

---

## 9. Security Controls & Rate Limiting

- **Sliding-Window Rate Limiter:** Applied per IP and per endpoint:
  - Login: 5 requests / min
  - Registration: 3 requests / 5 min
  - Forgot Password: 3 requests / 15 min
  - Reset Password: 5 requests / 15 min
  - Org Access Pass Gate: 5 attempts / min
- **Security Headers:** Strict HSTS, CSP frame protection (`X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, and tight Permissions-Policy.
- **Environment Isolation:** Zero credentials in source code. `.env` verified as untracked in Git.

---

## 10. API Routes Created

| Method | Endpoint | Description | Guard |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user account | Rate limited |
| `POST` | `/api/auth/login` | Authenticate user credentials | Rate limited |
| `POST` | `/api/auth/logout` | Invalidate session cookie | User session |
| `GET` | `/api/auth/me` | Retrieve profile & memberships | Require active session |
| `POST` | `/api/auth/forgot-password` | Request password reset token | Rate limited |
| `POST` | `/api/auth/reset-password` | Reset password with token | Rate limited |
| `GET` | `/api/organisations` | Public/Discoverable directory | Server pagination |
| `POST` | `/api/organisations` | Transactional org creation | Require active session |
| `GET` | `/api/organisations/[slug]` | Public organisation profile | Public / Member status |
| `POST` | `/api/organisations/[slug]/access` | Verify access password | Rate limited |
| `GET` | `/api/organisations/[slug]/dashboard` | Protected org dashboard | Member OR valid pass ticket |
| `PATCH` | `/api/organisations/[slug]/access-password` | Rotate access password | Owner / Admin only |
| `PATCH` | `/api/organisations/[slug]/settings` | Update org profile & privacy | Owner / Admin only |
| `GET` | `/api/organisations/[slug]/members` | List organisation members | Owner / Admin / Manager |

---

## 11. Frontend Pages Created

- `/`: Landing page with hero section, architecture highlights, and quick navigation.
- `/login`: User login screen with clear error alerts and password recovery navigation.
- `/register`: Registration screen with client & server validation.
- `/forgot-password`: Password reset request screen.
- `/reset-password`: Set new password screen with token verification.
- `/organisations`: Directory page with real-time search, type pills, city filter, and server pagination.
- `/organisations/new`: Multi-section organisation creation form with Argon2id access password setup.
- `/organisations/[slug]`: Public organisation showcase and gateway.
- `/organisations/[slug]/access`: Access password unlock screen.
- `/organisations/[slug]/dashboard`: Organisation dashboard with member counts, privacy mode, and future module placeholders.
- `/organisations/[slug]/settings`: Owner / Admin settings with general configuration, password rotation, and member list.
- `/profile`: User profile, account status, and multi-organisation switcher.

---

## 12. Automated Verification & Build Metrics

- **Unit & Integration Test Suites:** 12 suites (45 tests passed 100%).
- **Next.js Production Build:** PASSED (`npm run build`, 27 routes compiled cleanly).
- **Prisma Schema Validation:** PASSED.
- **Git Status:** Clean, `.env` strictly protected.

---

## 13. Known Issues & Future Considerations

- **Platform Admin Approval Gate:** Currently new organisations default to `ACTIVE`. A pending-verification approval queue for platform admins will be introduced in administrative management.
- **Email Service Provider:** Password reset tokens currently return via payload for local testing; an SMTP/SES provider (e.g. Resend, Postmark) can be plugged in during notification integration.

---

## 14. Recommended Next Phase

**PHASE 3 — EVENTS, ALBUMS & MEDIA METADATA FOUNDATION**
- Event creation and categorisation (Annual Fests, Tech Events, Convocations, Sports).
- Album hierarchy and folder structuring per tenant.
- Direct-to-S3 pre-signed upload URL generation for secure, proxy-free media ingest.
