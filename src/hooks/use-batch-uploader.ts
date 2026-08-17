'use client';

import { useState, useCallback, useRef } from 'react';
import { BatchUploadManager, UploadFileItem } from '@/lib/upload/batch-upload-manager';

export interface UseBatchUploaderOptions {
  slug: string;
  onBatchFinished?: (completed: number, failed: number, cancelled: number) => void;
}

export function useBatchUploader({ slug, onBatchFinished }: UseBatchUploaderOptions) {
  const [items, setItems] = useState<UploadFileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [concurrency, setConcurrency] = useState(6);
  const [uploadSpeedBytesPerSec, setUploadSpeedBytesPerSec] = useState(0);
  const [estimatedSecondsRemaining, setEstimatedSecondsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const managerRef = useRef<BatchUploadManager | null>(null);
  const speedSampleRef = useRef<{ time: number; bytes: number }>({ time: Date.now(), bytes: 0 });

  const startUpload = useCallback(
    async (files: File[], eventId: string, albumId?: string | null) => {
      setError(null);
      setIsUploading(true);
      setOverallProgress(0);
      setUploadedBytes(0);
      speedSampleRef.current = { time: Date.now(), bytes: 0 };

      const manager = new BatchUploadManager(files, {
        slug,
        eventId,
        albumId,
        concurrency,
        onItemProgress: (item) => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...item } : i))
          );
        },
        onItemStatusChange: (item) => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...item } : i))
          );
        },
        onBatchProgress: (prog, uploaded, total) => {
          setOverallProgress(prog);
          setUploadedBytes(uploaded);
          setTotalBytes(total);

          // Calculate speed and ETA
          const now = Date.now();
          const elapsedSec = (now - speedSampleRef.current.time) / 1000;
          if (elapsedSec >= 1) {
            const bytesDiff = uploaded - speedSampleRef.current.bytes;
            const currentSpeed = Math.max(0, bytesDiff / elapsedSec);
            setUploadSpeedBytesPerSec(currentSpeed);
            speedSampleRef.current = { time: now, bytes: uploaded };

            if (currentSpeed > 0) {
              const remainingBytes = total - uploaded;
              setEstimatedSecondsRemaining(Math.ceil(remainingBytes / currentSpeed));
            }
          }
        },
        onBatchComplete: (completed, failed, cancelled) => {
          setIsUploading(false);
          setEstimatedSecondsRemaining(null);
          setUploadSpeedBytesPerSec(0);
          onBatchFinished?.(completed, failed, cancelled);
        },
      });

      managerRef.current = manager;
      setItems(manager.getItems());

      try {
        await manager.start();
        setBatchId(manager.getBatchId());
      } catch (err: any) {
        setIsUploading(false);
        setError(err.message || 'Failed to start upload batch.');
      }
    },
    [slug, concurrency, onBatchFinished]
  );

  const cancelItem = useCallback((itemId: string) => {
    managerRef.current?.cancelItem(itemId);
  }, []);

  const cancelBatch = useCallback(() => {
    managerRef.current?.cancelAll();
    setIsUploading(false);
  }, []);

  const retryFailed = useCallback(() => {
    setIsUploading(true);
    managerRef.current?.retryFailed();
  }, []);

  const completedCount = items.filter((i) => ['READY', 'PROCESSING'].includes(i.status)).length;
  const failedCount = items.filter((i) => i.status === 'FAILED').length;
  const uploadingCount = items.filter((i) => i.status === 'UPLOADING').length;
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;
  const cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;

  return {
    items,
    isUploading,
    batchId,
    overallProgress,
    uploadedBytes,
    totalBytes,
    concurrency,
    setConcurrency,
    uploadSpeedBytesPerSec,
    estimatedSecondsRemaining,
    error,
    startUpload,
    cancelItem,
    cancelBatch,
    retryFailed,
    stats: {
      total: items.length,
      completed: completedCount,
      failed: failedCount,
      uploading: uploadingCount,
      pending: pendingCount,
      cancelled: cancelledCount,
    },
  };
}
