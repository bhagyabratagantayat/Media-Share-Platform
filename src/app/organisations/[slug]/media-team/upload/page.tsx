'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  UploadCloud,
  ArrowLeft,
  Calendar,
  FolderPlus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sliders,
  FileCheck,
  Film,
  Image as ImageIcon,
  StopCircle,
  Eye,
  Trash2,
} from 'lucide-react';
import { useBatchUploader } from '@/hooks/use-batch-uploader';

interface EventOption {
  id: string;
  name: string;
  slug: string;
  albums?: Array<{ id: string; name: string; slug: string }>;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function BulkUploadPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [uploadFinished, setUploadFinished] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const {
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
    error: uploadError,
    startUpload,
    cancelItem,
    cancelBatch,
    retryFailed,
    stats,
  } = useBatchUploader({
    slug: params.slug,
    onBatchFinished: () => {
      setUploadFinished(true);
    },
  });

  // Fetch organisation events
  useEffect(() => {
    if (!params.slug) return;
    setLoadingEvents(true);
    fetch(`/api/organisations/${params.slug}/events?limit=50`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setEvents(data.data);
          if (data.data.length > 0) {
            setSelectedEventId(data.data[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }, [params.slug]);

  // Handle selected event albums
  const currentEvent = events.find((e) => e.id === selectedEventId);
  const albums = currentEvent?.albums || [];

  // File selection validation
  const handleFilesAdded = (incomingFiles: FileList | File[]) => {
    const errors: string[] = [];
    const valid: File[] = [];
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ];

    const maxImg = 52428800; // 50MB
    const maxVid = 2147483648; // 2GB

    for (let i = 0; i < incomingFiles.length; i++) {
      const file = incomingFiles[i];
      const mime = file.type.toLowerCase();
      const isAllowed = allowedMimes.includes(mime) || file.name.match(/\.(jpg|jpeg|png|webp|heic|heif|mp4|mov|webm)$/i);

      if (!isAllowed) {
        errors.push(`${file.name}: Unsupported format.`);
        continue;
      }

      const isVideo = mime.startsWith('video/') || file.name.match(/\.(mp4|mov|webm)$/i);
      if (isVideo && file.size > maxVid) {
        errors.push(`${file.name}: Exceeds 2GB video limit.`);
        continue;
      }

      if (!isVideo && file.size > maxImg) {
        errors.push(`${file.name}: Exceeds 50MB image limit.`);
        continue;
      }

      valid.push(file);
    }

    if (errors.length > 0) {
      setClientErrors(errors.slice(0, 5));
    } else {
      setClientErrors([]);
    }

    setSelectedFiles((prev) => [...prev, ...valid]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleStart = () => {
    if (!selectedEventId || selectedFiles.length === 0) return;
    startUpload(selectedFiles, selectedEventId, selectedAlbumId || null);
  };

  const totalSelectedSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/organisations/${params.slug}/media-team`}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Media Team Hub
        </Link>
        <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded-full border border-cyan-800">
          Direct-to-S3 Multi-part Enabled
        </span>
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Bulk Official Media Upload
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload hundreds of high-resolution photos and 4K videos directly to object storage without server bottlenecks.
        </p>
      </div>

      {/* Upload Form / Live Pipeline */}
      {!isUploading && !uploadFinished ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Target Event & Album Settings */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" /> Target Event & Album
              </h2>

              {/* Event Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Select Event *</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    setSelectedAlbumId('');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                  disabled={loadingEvents}
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Album Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Target Album (Optional)</label>
                <select
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">No specific album (Root event gallery)</option>
                  {albums.map((alb) => (
                    <option key={alb.id} value={alb.id}>
                      {alb.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Concurrency Settings */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Upload Concurrency
                  </label>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{concurrency} Streams</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="2"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">
                  Controls simultaneous active uploads from your browser.
                </p>
              </div>
            </div>

            {/* Selected Summary Card */}
            {selectedFiles.length > 0 && (
              <div className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-800/40 space-y-3">
                <div className="flex items-center justify-between text-xs text-cyan-400 font-semibold uppercase">
                  <span>Batch Summary</span>
                  <FileCheck className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Total Files:</span>
                  <span className="font-bold text-white">{selectedFiles.length} items</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Total Size:</span>
                  <span className="font-bold text-white">{formatBytes(totalSelectedSize)}</span>
                </div>
                <button
                  onClick={() => setSelectedFiles([])}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-red-400 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 transition"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>

          {/* Drag & Drop File Area */}
          <div className="lg:col-span-2 space-y-6">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`p-8 sm:p-12 rounded-3xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center min-h-[300px] ${
                dragActive
                  ? 'border-cyan-400 bg-cyan-950/30'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                Drag and drop media files or folders here
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6">
                Supports JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM. Up to 50MB per photo and 2GB per video.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                >
                  Browse Files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl font-semibold text-xs text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Select Folder
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
                className="hidden"
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory="true"
                // @ts-ignore
                directory="true"
                multiple
                onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Validation Errors list */}
            {clientErrors.length > 0 && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-900/60 text-xs text-red-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>Some files could not be added:</span>
                </div>
                {clientErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            {/* Upload Action Button */}
            {selectedFiles.length > 0 && (
              <button
                onClick={handleStart}
                disabled={!selectedEventId}
                className="w-full py-4 rounded-2xl font-bold text-base text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UploadCloud className="w-5 h-5" />
                <span>
                  Start Direct Upload ({selectedFiles.length} files • {formatBytes(totalSelectedSize)})
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Live Upload Progress Monitor */
        <div className="space-y-6">
          {/* Header Monitor Card */}
          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800 backdrop-blur-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white">
                    {uploadFinished ? 'Upload Batch Completed' : 'Uploading Media Directly to Storage'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                    {overallProgress}%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} transferred • {stats.completed} done, {stats.failed} failed
                </p>
              </div>

              <div className="flex items-center gap-3">
                {uploadSpeedBytesPerSec > 0 && (
                  <div className="text-right">
                    <div className="text-xs font-mono font-semibold text-cyan-400">
                      {formatBytes(uploadSpeedBytesPerSec)}/s
                    </div>
                    {estimatedSecondsRemaining !== null && (
                      <div className="text-[10px] text-slate-500">
                        ~{estimatedSecondsRemaining}s remaining
                      </div>
                    )}
                  </div>
                )}

                {isUploading && (
                  <button
                    onClick={cancelBatch}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-red-400 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 transition flex items-center gap-1.5"
                  >
                    <StopCircle className="w-4 h-4" /> Cancel Batch
                  </button>
                )}

                {stats.failed > 0 && !isUploading && (
                  <button
                    onClick={retryFailed}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-900/60 transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" /> Retry Failed ({stats.failed})
                  </button>
                )}

                {uploadFinished && batchId && (
                  <Link
                    href={`/organisations/${params.slug}/media-team/batches/${batchId}`}
                    className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> View Batch Details
                  </Link>
                )}
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Granular File List */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>File Item ({items.length})</span>
              <span>Status & Progress</span>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                      {item.file.type.startsWith('video/') ? (
                        <Film className="w-4 h-4 text-purple-400" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate max-w-xs sm:max-w-md">
                        {item.file.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatBytes(item.file.size)}
                        {item.error && <span className="text-red-400 ml-2">• {item.error}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="w-28 text-right space-y-1">
                      <div className="font-medium text-slate-300">
                        {item.status === 'PROCESSING'
                          ? 'Optimizing...'
                          : item.status === 'READY'
                          ? 'Complete'
                          : item.status === 'UPLOADING'
                          ? `${item.progress}%`
                          : item.status}
                      </div>
                      {item.status === 'UPLOADING' && (
                        <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-cyan-400 rounded-full"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {item.status === 'UPLOADING' && (
                      <button
                        onClick={() => cancelItem(item.id)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 transition"
                        title="Cancel this file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
