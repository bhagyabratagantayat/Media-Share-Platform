# Local Object Storage Setup Guide (MinIO & S3 Emulation)

This guide documents how to run a local S3-compatible object storage server for local development and testing using **MinIO**.

---

## 1. Quick Start with Docker

Run MinIO in a local Docker container:

```bash
docker run -d \
  --name media-platform-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  -v minio_data:/data \
  minio/minio server /data --console-address ":9001"
```

- **S3 API Endpoint:** `http://127.0.0.1:9000`
- **Web Console:** `http://127.0.0.1:9001` (Login: `minioadmin` / `minioadmin`)

---

## 2. Bucket Creation & CORS Configuration

1. Open `http://127.0.0.1:9001` in your browser and log in.
2. Click **Buckets** → **Create Bucket**.
3. Name the bucket: `media-platform-dev`
4. Configure Bucket **CORS** policy:
   Under **Bucket Settings** → **CORS**, add the following rule:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Environment Configuration (`.env`)

Add the following environment variables to your local `.env` file:

```env
STORAGE_PROVIDER="s3"
S3_ENDPOINT="http://127.0.0.1:9000"
S3_REGION="us-east-1"
S3_BUCKET="media-platform-dev"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_FORCE_PATH_STYLE="true"
S3_UPLOAD_URL_EXPIRES_SECONDS="900"
S3_DOWNLOAD_URL_EXPIRES_SECONDS="300"
MAX_IMAGE_UPLOAD_BYTES="52428800"
MAX_VIDEO_UPLOAD_BYTES="2147483648"
MULTIPART_CHUNK_SIZE_BYTES="10485760"
```

> **Security Note:** Never commit `.env` or real production credentials to Git. Local development variables must remain strictly local.

---

## 4. Testing Direct Uploads

1. Start your local development server:
   ```bash
   npm run dev
   ```
2. Navigate to your event gallery page:
   `http://localhost:3000/organisations/<org-slug>/events/<event-slug>/upload`
3. Drag and drop any photo (`.jpg`, `.png`, `.webp`, `.heic`) or video (`.mp4`, `.mov`, `.webm`).
4. Observe real-time progress bar streaming binary chunks directly to `http://127.0.0.1:9000/media-platform-dev/...` without passing payload binaries through the Next.js server.
5. In the MinIO console, observe the uploaded object under the structured prefix `organisations/{orgId}/events/{eventId}/media/{mediaId}/original`.
