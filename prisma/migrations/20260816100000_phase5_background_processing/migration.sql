-- AlterEnum
ALTER TYPE "MediaStatus" ADD VALUE 'QUEUED';

-- AlterTable
ALTER TABLE "media_items" ADD COLUMN "processing_progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processing_error" TEXT,
ADD COLUMN "processing_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "processing_started_at" TIMESTAMP(3),
ADD COLUMN "processing_completed_at" TIMESTAMP(3),
ADD COLUMN "original_file_size" BIGINT,
ADD COLUMN "optimized_file_size" BIGINT,
ADD COLUMN "compression_ratio" DOUBLE PRECISION;
