'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileImage,
  FileVideo,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Layers,
  StopCircle,
} from 'lucide-react';

export interface DirectUploaderProps {
  organisationId: string;
  organisationSlug: string;
  eventId: string;
  eventSlug: string;
  albums?: { id: string; name: string }[];
  onUploadSuccess?: () => void;
}

export type QueueItemStatus =
  | 'QUEUED'
  | 'INITIALIZING'
  | 'UPLOADING'
  | 'COMPLETING'
  | 'SUCCESS'
  | 'ERROR'
  | 'CANCELLED';

export interface UploadQueueItem {
  id: string;
  file: File;
  albumId?: string;
  status: QueueItemStatus;
  progressPercent: number;
  uploadedBytes: number;
  totalBytes: number;
  isMultipart: boolean;
  partsTotal?: number;
  partsCompleted?: number;
  uploadSessionId?: string;
  errorMessage?: string;
  xhrInstance?: XMLHttpRequest;
}

export function DirectUploader({
  organisationId,
  organisationSlug,
  eventId,
  eventSlug,
  albums = [],
  onUploadSuccess,
}: DirectUploaderProps) {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, updates: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const handleFileSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: UploadQueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      albumId: selectedAlbumId || undefined,
      status: 'QUEUED',
      progressPercent: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      isMultipart: file.size >= 10 * 1024 * 1024, // 10MB chunk threshold
    }));

    setQueue((prev) => [...prev, ...newItems]);
  };

  const uploadSingleFile = async (item: UploadQueueItem) => {
    try {
      updateItem(item.id, { status: 'INITIALIZING', progressPercent: 5 });

      // 1. Create upload session via API
      const createRes = await fetch('/api/uploads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          eventId,
          albumId: item.albumId || null,
          fileName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          fileSize: item.file.size,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error?.message || 'Failed to initialize upload session.');
      }

      const session = createData.data;
      updateItem(item.id, {
        uploadSessionId: session.uploadSessionId,
        isMultipart: session.isMultipart,
        partsTotal: session.partsCount || 1,
      });

      // 2. Direct browser upload to S3
      if (!session.isMultipart) {
        // Direct Single PUT upload
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          updateItem(item.id, { xhrInstance: xhr, status: 'UPLOADING' });

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 90);
              updateItem(item.id, {
                progressPercent: percent,
                uploadedBytes: e.loaded,
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Direct S3 upload failed with HTTP status ${xhr.status}.`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during direct storage upload.'));
          xhr.onabort = () => reject(new Error('Upload was cancelled.'));

          xhr.open('PUT', session.uploadUrl);
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');
          xhr.send(item.file);
        });

        // 3. Complete single upload
        updateItem(item.id, { status: 'COMPLETING', progressPercent: 95 });
        const completeRes = await fetch(`/api/uploads/${session.uploadSessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.success) {
          throw new Error(completeData.error?.message || 'Failed to verify uploaded file.');
        }

        updateItem(item.id, { status: 'SUCCESS', progressPercent: 100 });
        onUploadSuccess?.();
      } else {
        // Direct Chunked Multipart Upload
        updateItem(item.id, { status: 'UPLOADING' });
        const chunkSize = session.chunkSize || 10 * 1024 * 1024;
        const parts = session.parts as { partNumber: number; uploadUrl: string }[];
        const completedParts: { partNumber: number; etag: string }[] = [];

        for (let i = 0; i < parts.length; i++) {
          const partInfo = parts[i];
          const start = (partInfo.partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, item.file.size);
          const chunk = item.file.slice(start, end);

          const etag = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            updateItem(item.id, { xhrInstance: xhr });

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const totalUploadedSoFar = start + e.loaded;
                const percent = Math.min(Math.round((totalUploadedSoFar / item.file.size) * 90), 90);
                updateItem(item.id, {
                  progressPercent: percent,
                  uploadedBytes: totalUploadedSoFar,
                  partsCompleted: i,
                });
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                const rawEtag = xhr.getResponseHeader('ETag') || `"part-${partInfo.partNumber}"`;
                resolve(rawEtag);
              } else {
                reject(new Error(`Part ${partInfo.partNumber} failed with status ${xhr.status}.`));
              }
            };

            xhr.onerror = () => reject(new Error(`Network error uploading part ${partInfo.partNumber}.`));
            xhr.onabort = () => reject(new Error('Multipart upload was cancelled.'));

            xhr.open('PUT', partInfo.uploadUrl);
            xhr.send(chunk);
          });

          completedParts.push({
            partNumber: partInfo.partNumber,
            etag,
          });

          updateItem(item.id, { partsCompleted: i + 1 });
        }

        // 3. Complete multipart upload
        updateItem(item.id, { status: 'COMPLETING', progressPercent: 95 });
        const completeRes = await fetch(`/api/uploads/${session.uploadSessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts: completedParts }),
        });

        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.success) {
          throw new Error(completeData.error?.message || 'Failed to assemble multipart parts in storage.');
        }

        updateItem(item.id, { status: 'SUCCESS', progressPercent: 100 });
        onUploadSuccess?.();
      }
    } catch (err: any) {
      if (err.message === 'Upload was cancelled.' || err.message === 'Multipart upload was cancelled.') {
        updateItem(item.id, { status: 'CANCELLED' });
      } else {
        updateItem(item.id, {
          status: 'ERROR',
          errorMessage: err.message || 'Upload failed.',
        });
      }
    }
  };

  const cancelUpload = async (item: UploadQueueItem) => {
    if (item.xhrInstance) {
      item.xhrInstance.abort();
    }

    if (item.uploadSessionId) {
      try {
        await fetch(`/api/uploads/${item.uploadSessionId}/abort`, { method: 'POST' });
      } catch {
        // Best effort abort
      }
    }

    updateItem(item.id, { status: 'CANCELLED' });
  };

  const retryUpload = (item: UploadQueueItem) => {
    updateItem(item.id, {
      status: 'QUEUED',
      progressPercent: 0,
      uploadedBytes: 0,
      errorMessage: undefined,
    });
  };

  const startAllQueued = () => {
    const queuedItems = queue.filter((i) => i.status === 'QUEUED');
    queuedItems.forEach((item) => uploadSingleFile(item));
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((i) => i.status !== 'SUCCESS' && i.status !== 'CANCELLED'));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Direct Object Storage Uploader
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Zero-proxy binary transfer: Files stream directly from your browser to secure object storage.
          </p>
        </div>

        {albums.length > 0 && (
          <div className="w-full sm:w-auto">
            <label className="text-xs font-semibold text-slate-400 block mb-1">Target Album</label>
            <select
              value={selectedAlbumId}
              onChange={(e) => setSelectedAlbumId(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">No Album (Event Root)</option>
              {albums.map((alb) => (
                <option key={alb.id} value={alb.id}>
                  {alb.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileSelection(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => handleFileSelection(e.target.files)}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Drag and drop high-res photos & 4K videos here, or{' '}
              <span className="text-indigo-400 underline decoration-indigo-500/30">browse files</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports JPG, PNG, WEBP, HEIC (up to 50MB) and MP4, MOV, WEBM (up to 2GB)
            </p>
          </div>
        </div>
      </div>

      {/* Upload Queue Listing */}
      {queue.length > 0 && (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">
                Upload Queue ({queue.length} items)
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {queue.some((i) => i.status === 'QUEUED') && (
                <button
                  type="button"
                  onClick={startAllQueued}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                >
                  Start All Uploads
                </button>
              )}
              {queue.some((i) => i.status === 'SUCCESS' || i.status === 'CANCELLED') && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  Clear Finished
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {queue.map((item) => {
              const isVideo = item.file.type.startsWith('video/');
              return (
                <div
                  key={item.id}
                  className="p-4 bg-slate-950/60 border border-slate-800/60 rounded-xl space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        {isVideo ? (
                          <FileVideo className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <FileImage className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{item.file.name}</p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>{formatBytes(item.file.size)}</span>
                          {item.isMultipart && (
                            <span className="px-1.5 py-0.2 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">
                              Multipart
                            </span>
                          )}
                          {item.status === 'UPLOADING' && item.partsTotal && item.partsTotal > 1 && (
                            <span className="text-slate-400">
                              Part {item.partsCompleted || 0} of {item.partsTotal}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.status === 'QUEUED' && (
                        <button
                          type="button"
                          onClick={() => uploadSingleFile(item)}
                          className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium rounded-md transition-all"
                        >
                          Upload
                        </button>
                      )}

                      {(item.status === 'INITIALIZING' ||
                        item.status === 'UPLOADING' ||
                        item.status === 'COMPLETING') && (
                        <button
                          type="button"
                          onClick={() => cancelUpload(item)}
                          title="Cancel Upload"
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <StopCircle className="w-4 h-4" />
                        </button>
                      )}

                      {item.status === 'SUCCESS' && (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Uploaded</span>
                        </div>
                      )}

                      {item.status === 'ERROR' && (
                        <div className="flex items-center gap-2">
                          <span className="text-rose-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                          <button
                            type="button"
                            onClick={() => retryUpload(item)}
                            title="Retry"
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {item.status === 'CANCELLED' && (
                        <span className="text-slate-500 text-xs">Cancelled</span>
                      )}

                      <button
                        type="button"
                        onClick={() => setQueue((prev) => prev.filter((i) => i.id !== item.id))}
                        className="p-1 text-slate-500 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(item.status === 'UPLOADING' ||
                    item.status === 'INITIALIZING' ||
                    item.status === 'COMPLETING') && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-150 rounded-full"
                          style={{ width: `${item.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>
                          {item.status === 'INITIALIZING' && 'Authorizing signed URL...'}
                          {item.status === 'UPLOADING' &&
                            `Streaming to object storage: ${formatBytes(item.uploadedBytes)} / ${formatBytes(item.totalBytes)}`}
                          {item.status === 'COMPLETING' && 'Verifying storage object...'}
                        </span>
                        <span className="font-mono">{item.progressPercent}%</span>
                      </div>
                    </div>
                  )}

                  {item.errorMessage && (
                    <p className="text-[11px] text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                      {item.errorMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
