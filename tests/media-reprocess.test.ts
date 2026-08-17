import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueMediaProcessingJob } from '@/server/queue/media-queue';
import { prisma } from '@/server/db/prisma';
import { MediaType, MediaStatus, UploadType } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockMediaItemUpdate = vi.fn();
  return {
    prisma: {
      mediaItem: {
        update: mockMediaItemUpdate,
      },
    },
  };
});

describe('Media Processing Queue & Reprocess Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues job and sets MediaItem status to QUEUED', async () => {
    vi.mocked(prisma.mediaItem.update).mockResolvedValue({
      id: 'med_reproc_1',
      status: MediaStatus.QUEUED,
      processingProgress: 0,
      processingVersion: 2,
    } as any);

    const jobId = await enqueueMediaProcessingJob({
      mediaItemId: 'med_reproc_1',
      organisationId: 'org_1',
      eventId: 'evt_1',
      userId: 'usr_admin',
      mediaType: MediaType.IMAGE,
      originalStorageKey: 'organisations/org_1/events/evt_1/media/med_reproc_1/original',
      mimeType: 'image/jpeg',
      fileName: 'retest.jpg',
      uploadType: UploadType.OFFICIAL,
      processingVersion: 2,
    });

    expect(jobId).toBe('media-proc-med_reproc_1-v2');

    expect(prisma.mediaItem.update).toHaveBeenCalledWith({
      where: { id: 'med_reproc_1' },
      data: {
        status: MediaStatus.QUEUED,
        processingProgress: 0,
        processingError: null,
        processingVersion: 2,
      },
    });
  });
});
