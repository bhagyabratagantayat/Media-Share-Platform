'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Archive,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  FileArchive,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

export interface BulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  scopeType: 'SELECTED_MEDIA' | 'ALBUM' | 'EVENT' | 'ORGANISATION';
  eventId?: string;
  albumId?: string;
  selectedMediaIds?: string[];
  scopeTitle?: string;
  canDownloadOriginal?: boolean;
}

export function BulkExportModal({
  isOpen,
  onClose,
  orgSlug,
  scopeType,
  eventId,
  albumId,
  selectedMediaIds = [],
  scopeTitle,
  canDownloadOriginal = false,
}: BulkExportModalProps) {
  const [variant, setVariant] = useState<'OPTIMIZED' | 'ORIGINAL'>('OPTIMIZED');
  const [isLoading, setIsLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/organisations/${orgSlug}/exports/${jobId}`);
        const data = await res.json();

        if (data.success && data.data) {
          setActiveJob(data.data);

          if (data.data.status === 'READY' || data.data.status === 'FAILED' || data.data.status === 'CANCELLED') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch (err: any) {
        console.error('Failed to poll export job:', err);
      }
    }, 1500);
  };

  const handleStartExport = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/organisations/${orgSlug}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeType,
          eventId: eventId || undefined,
          albumId: albumId || undefined,
          mediaIds: scopeType === 'SELECTED_MEDIA' ? selectedMediaIds : undefined,
          requestedVariant: variant,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to start bulk export.');
      }

      setActiveJob(data.data);
      startPolling(data.data.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred starting the export.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      await fetch(`/api/organisations/${orgSlug}/exports/${activeJob.id}/cancel`, {
        method: 'POST',
      });
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      setActiveJob({ ...activeJob, status: 'CANCELLED' });
    } catch (err) {
      console.error('Failed to cancel export:', err);
    }
  };

  const formatBytes = (bytesStr?: string | number | null) => {
    if (!bytesStr) return '0 B';
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-zinc-100">Bulk Media Export</h3>
              <p className="text-xs text-zinc-400">
                {scopeTitle || `${scopeType.replace('_', ' ')} Archive`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-5">
          {errorMessage && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!activeJob ? (
            <>
              {/* Scope summary */}
              <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">Export Scope</span>
                  <span className="font-medium text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded-md">
                    {scopeType === 'SELECTED_MEDIA'
                      ? `${selectedMediaIds.length} Selected Photos/Videos`
                      : scopeType}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">Archive Format</span>
                  <span className="font-medium text-zinc-200">Standard ZIP (.zip)</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">Delivery Method</span>
                  <span className="font-medium text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> High-Speed Direct CDN
                  </span>
                </div>
              </div>

              {/* Quality selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300 block">Select Quality Preset</label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Optimized Option */}
                  <button
                    type="button"
                    onClick={() => setVariant('OPTIMIZED')}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition ${
                      variant === 'OPTIMIZED'
                        ? 'bg-violet-500/10 border-violet-500/50 text-violet-200 ring-1 ring-violet-500/30'
                        : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-violet-400" /> Optimized
                      </span>
                      {variant === 'OPTIMIZED' && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />}
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      Fast download, high-res web images &amp; 1080p video.
                    </span>
                  </button>

                  {/* Original Option */}
                  <button
                    type="button"
                    disabled={!canDownloadOriginal}
                    onClick={() => setVariant('ORIGINAL')}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition ${
                      !canDownloadOriginal
                        ? 'opacity-50 cursor-not-allowed bg-zinc-900/20 border-zinc-800/50 text-zinc-500'
                        : variant === 'ORIGINAL'
                        ? 'bg-violet-500/10 border-violet-500/50 text-violet-200 ring-1 ring-violet-500/30'
                        : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-400" /> Original Masters
                      </span>
                      {variant === 'ORIGINAL' && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />}
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {canDownloadOriginal
                        ? 'Raw camera originals with full EXIF data.'
                        : 'Restricted by organisation policy.'}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Active Job Progress View */
            <div className="space-y-5">
              {activeJob.status === 'READY' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mx-auto">
                    <FileArchive className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base text-zinc-100">Your Archive is Ready!</h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      {activeJob.processedFiles} files ({formatBytes(activeJob.archiveSize)}) ready for download.
                    </p>
                  </div>

                  <div className="pt-2">
                    <a
                      href={`/api/organisations/${orgSlug}/exports/${activeJob.id}/download`}
                      download
                      className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm hover:from-emerald-400 hover:to-teal-400 transition shadow-lg shadow-emerald-500/20"
                    >
                      <Download className="h-4 w-4" /> Download ZIP Archive
                    </a>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Direct high-speed delivery. Link expires in 24 hours.
                  </p>
                </div>
              ) : activeJob.status === 'FAILED' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mx-auto">
                    <AlertCircle className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base text-rose-300">Export Failed</h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      {activeJob.errorMessage || 'Unable to complete the export archive.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveJob(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition"
                  >
                    Try Again
                  </button>
                </div>
              ) : activeJob.status === 'CANCELLED' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400 border border-zinc-700 mx-auto">
                    <X className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base text-zinc-300">Export Cancelled</h4>
                    <p className="text-xs text-zinc-500 mt-1">The export job was cancelled.</p>
                  </div>
                  <button
                    onClick={() => setActiveJob(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition"
                  >
                    Start New Export
                  </button>
                </div>
              ) : (
                /* Processing & Queued State */
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                      {activeJob.status === 'QUEUED' ? 'Queued in background...' : 'Building ZIP archive...'}
                    </span>
                    <span className="font-semibold text-violet-400">{activeJob.progress || 0}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2.5 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, activeJob.progress || 0)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>
                      {activeJob.processedFiles || 0} / {activeJob.fileCount || 0} items processed
                    </span>
                    <span>{formatBytes(activeJob.processedBytes)} streamed</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleCancel}
                      className="text-xs text-zinc-400 hover:text-rose-400 transition"
                    >
                      Cancel Job
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!activeJob && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartExport}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium transition shadow-lg shadow-violet-600/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Start Export
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
