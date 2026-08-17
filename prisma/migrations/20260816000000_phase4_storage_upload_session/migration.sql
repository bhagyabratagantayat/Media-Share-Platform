-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('COLLEGE', 'UNIVERSITY', 'SCHOOL', 'INSTITUTE', 'COMPANY', 'NGO', 'CLUB', 'EVENT_ORGANISATION', 'OTHER');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrgPrivacy" AS ENUM ('PRIVATE', 'DISCOVERABLE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'ORGANISATION_OWNER', 'ORGANISATION_ADMIN', 'SOCIAL_MEDIA_MANAGER', 'SOCIAL_MEDIA_MEMBER', 'MODERATOR', 'USER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PRIVATE', 'ORGANISATION', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AlbumStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'ORGANISATION', 'PRIVATE');

-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('ORIGINAL', 'OPTIMIZED', 'THUMBNAIL', 'PREVIEW', 'STREAM_1080P', 'STREAM_720P', 'STREAM_480P');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('CREATED', 'UPLOADING', 'COMPLETED', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadType" AS ENUM ('OFFICIAL', 'USER_SUBMISSION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'COLLEGE',
    "description" TEXT,
    "official_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "website" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "privacy" "OrgPrivacy" NOT NULL DEFAULT 'DISCOVERABLE',
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_quotas" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "storage_limit_bytes" BIGINT NOT NULL DEFAULT 53687091200,
    "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "storage_reserved_bytes" BIGINT NOT NULL DEFAULT 0,
    "max_concurrent_uploads" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_members" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_access_settings" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "access_version" INTEGER NOT NULL DEFAULT 1,
    "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_access_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "cover_media_id" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'ORGANISATION',
    "allow_user_uploads" BOOLEAN NOT NULL DEFAULT false,
    "allow_downloads" BOOLEAN NOT NULL DEFAULT true,
    "face_search_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "AlbumStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_items" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "album_id" TEXT,
    "uploader_id" TEXT NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'ORGANISATION',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "face_search_enabled" BOOLEAN NOT NULL DEFAULT false,
    "original_storage_key" TEXT,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "frame_rate" DOUBLE PRECISION,
    "codec" TEXT,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "variant_type" "VariantType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bitrate" INTEGER,
    "duration_ms" INTEGER,
    "codec" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "album_id" TEXT,
    "media_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "upload_type" "UploadType" NOT NULL DEFAULT 'OFFICIAL',
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "upload_id" TEXT,
    "parts_count" INTEGER,
    "is_multipart" BOOLEAN NOT NULL DEFAULT false,
    "status" "UploadStatus" NOT NULL DEFAULT 'CREATED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");
CREATE INDEX "organisations_slug_idx" ON "organisations"("slug");
CREATE INDEX "organisations_status_idx" ON "organisations"("status");
CREATE INDEX "organisations_privacy_idx" ON "organisations"("privacy");
CREATE INDEX "organisations_city_idx" ON "organisations"("city");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_quotas_organisation_id_key" ON "organisation_quotas"("organisation_id");
CREATE INDEX "organisation_quotas_organisation_id_idx" ON "organisation_quotas"("organisation_id");

-- CreateIndex
CREATE INDEX "organisation_members_user_id_idx" ON "organisation_members"("user_id");
CREATE INDEX "organisation_members_organisation_id_idx" ON "organisation_members"("organisation_id");
CREATE INDEX "organisation_members_organisation_id_role_idx" ON "organisation_members"("organisation_id", "role");
CREATE UNIQUE INDEX "organisation_members_organisation_id_user_id_key" ON "organisation_members"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_access_settings_organisation_id_key" ON "organisation_access_settings"("organisation_id");
CREATE INDEX "organisation_access_settings_organisation_id_idx" ON "organisation_access_settings"("organisation_id");

-- CreateIndex
CREATE INDEX "events_organisation_id_idx" ON "events"("organisation_id");
CREATE INDEX "events_organisation_id_event_date_idx" ON "events"("organisation_id", "event_date");
CREATE INDEX "events_organisation_id_status_idx" ON "events"("organisation_id", "status");
CREATE INDEX "events_organisation_id_visibility_idx" ON "events"("organisation_id", "visibility");
CREATE UNIQUE INDEX "events_organisation_id_slug_key" ON "events"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "albums_organisation_id_idx" ON "albums"("organisation_id");
CREATE INDEX "albums_event_id_idx" ON "albums"("event_id");
CREATE INDEX "albums_event_id_sort_order_idx" ON "albums"("event_id", "sort_order");
CREATE UNIQUE INDEX "albums_event_id_slug_key" ON "albums"("event_id", "slug");

-- CreateIndex
CREATE INDEX "media_items_organisation_id_idx" ON "media_items"("organisation_id");
CREATE INDEX "media_items_event_id_idx" ON "media_items"("event_id");
CREATE INDEX "media_items_album_id_idx" ON "media_items"("album_id");
CREATE INDEX "media_items_uploader_id_idx" ON "media_items"("uploader_id");
CREATE INDEX "media_items_status_idx" ON "media_items"("status");
CREATE INDEX "media_items_approval_status_idx" ON "media_items"("approval_status");
CREATE INDEX "media_items_event_id_created_at_idx" ON "media_items"("event_id", "created_at");
CREATE INDEX "media_items_album_id_created_at_idx" ON "media_items"("album_id", "created_at");
CREATE INDEX "media_items_organisation_id_checksum_idx" ON "media_items"("organisation_id", "checksum");

-- CreateIndex
CREATE INDEX "media_variants_media_item_id_idx" ON "media_variants"("media_item_id");
CREATE INDEX "media_variants_media_item_id_variant_type_idx" ON "media_variants"("media_item_id", "variant_type");

-- CreateIndex
CREATE INDEX "upload_sessions_organisation_id_idx" ON "upload_sessions"("organisation_id");
CREATE INDEX "upload_sessions_event_id_idx" ON "upload_sessions"("event_id");
CREATE INDEX "upload_sessions_media_item_id_idx" ON "upload_sessions"("media_item_id");
CREATE INDEX "upload_sessions_user_id_idx" ON "upload_sessions"("user_id");
CREATE INDEX "upload_sessions_status_expires_at_idx" ON "upload_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_organisation_id_created_at_idx" ON "audit_logs"("organisation_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_quotas" ADD CONSTRAINT "organisation_quotas_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_access_settings" ADD CONSTRAINT "organisation_access_settings_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
