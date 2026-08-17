'use client';

import React, { useState, useEffect } from 'react';
import {
  Archive,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Loader2,
  Trash2,
} from 'lucide-react';

export interface ExportHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
}

export function ExportHistoryDrawer({ isOpen, onClose, orgSlug }: ExportHistoryDrawerProps) {
  const [exports, setExports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchExports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organisations/${orgSlug}/exports?page=${page}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setExports(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch exports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExports();
    }
  }, [isOpen, orgSlug, page]);

  if (!isOpen) return null;

  const formatBytes = (bytesStr?: string | number | null) => {
    if (!bytesStr) return '0 B';
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
            <CheckCircle2 className="h-3 w-3" /> Ready
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[11px] font-medium">
            <Loader2 className="h-3 w-3 animate-spin" /> Processing
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-medium">
            <Clock className="h-3 w-3" /> Queued
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-medium">
            <AlertCircle className="h-3 w-3" /> Failed
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-zinc-700 text-[11px] font-medium">
            Expired
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700 text-[11px] font-medium">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 flex flex-col text-zinc-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Archive className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">Export History</h3>
              <p className="text-[11px] text-zinc-400">Archives generated in this organisation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchExports}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* List of Exports */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs">Loading export history...</p>
            </div>
          ) : exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 space-y-2">
              <Archive className="h-8 w-8 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-400">No export jobs yet</p>
              <p className="text-xs text-zinc-600 max-w-xs">
                Export batches of photos, albums, or entire events to download ZIP archives.
              </p>
            </div>
          ) : (
            exports.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">
                      {item.scopeType.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-zinc-500 block">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {getStatusBadge(item.status)}
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-800/60">
                  <span>
                    {item.processedFiles || item.fileCount} items
                    {item.archiveSize ? ` (${formatBytes(item.archiveSize)})` : ''}
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    {item.requestedVariant === 'ORIGINAL' ? 'Originals' : 'Optimized'}
                  </span>
                </div>

                {item.status === 'READY' && (
                  <a
                    href={`/api/organisations/${orgSlug}/exports/${item.id}/download`}
                    download
                    className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Download ZIP
                  </a>
                )}

                {['QUEUED', 'PROCESSING'].includes(item.status) && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Progress</span>
                      <span>{item.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${Math.max(5, item.progress || 0)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
