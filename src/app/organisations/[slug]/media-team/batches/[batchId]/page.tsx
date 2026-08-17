'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Layers,
  ArrowLeft,
  RefreshCw,
  StopCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Film,
  Image as ImageIcon,
  Search,
  CheckSquare,
  Globe,
  Archive,
  ExternalLink,
} from 'lucide-react';

interface BatchItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  mediaItemId?: string;
  mediaItem?: {
    id: string;
    status: string;
    isPublished: boolean;
    mediaType: string;
  };
}

interface BatchDetails {
  batch: {
    id: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    cancelledFiles: number;
    totalBytes: number;
    uploadedBytes: number;
    createdAt: string;
    event: { id: string; name: string; slug: string };
    album?: { id: string; name: string; slug: string } | null;
    creator: { id: string; name: string; email: string };
  };
  items: BatchItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function BatchDetailsPage() {
  const params = useParams<{ slug: string; batchId: string }>();
  const router = useRouter();

  const [data, setData] = useState<BatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchBatch = () => {
    if (!params.slug || !params.batchId) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (statusFilter) query.set('status', statusFilter);
    if (search) query.set('search', search);
    query.set('page', page.toString());
    query.set('limit', '50');

    fetch(
      `/api/organisations/${params.slug}/media-team/batches/${params.batchId}?${query.toString()}`
    )
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success && resData.data) {
          setData(resData.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBatch();
  }, [params.slug, params.batchId, statusFilter, search, page]);

  const handleRetryAll = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/media-team/batches/${params.batchId}/retry`,
        { method: 'POST' }
      );
      if (res.ok) {
        setActionMessage('All failed items queued for retry.');
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelBatch = async () => {
    if (!confirm('Are you sure you want to cancel remaining items in this batch?')) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/media-team/batches/${params.batchId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setActionMessage('Batch cancelled.');
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkPublishReady = async () => {
    if (!data) return;
    const readyMediaIds = data.items
      .filter((i) => i.mediaItemId && i.status === 'READY')
      .map((i) => i.mediaItemId!);

    if (readyMediaIds.length === 0) {
      alert('No media items currently in READY state on this page.');
      return;
    }

    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/organisations/${params.slug}/media-team/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: data.batch.event.id,
          mediaIds: readyMediaIds,
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setActionMessage(resData.message || 'Media items published successfully.');
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-md mx-auto my-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Batch Not Found</h2>
        <Link
          href={`/organisations/${params.slug}/media-team/batches`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700"
        >
          Back to Batches
        </Link>
      </div>
    );
  }

  const { batch, items, pagination } = data;
  const progressPct =
    batch.totalFiles > 0 ? Math.round((batch.completedFiles / batch.totalFiles) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/organisations/${params.slug}/media-team/batches`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Batch History
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Batch: {batch.event.name}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                batch.status === 'COMPLETED'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : batch.status === 'PARTIALLY_FAILED' || batch.status === 'FAILED'
                  ? 'bg-red-950 text-red-400 border border-red-800'
                  : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
              }`}
            >
              {batch.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Initiated by {batch.creator.name} • {new Date(batch.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {batch.failedFiles > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-900/60 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" /> Retry Failed ({batch.failedFiles})
            </button>
          )}

          {['CREATED', 'UPLOADING'].includes(batch.status) && (
            <button
              onClick={handleCancelBatch}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-red-400 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 transition flex items-center gap-1.5"
            >
              <StopCircle className="w-4 h-4" /> Cancel Batch
            </button>
          )}

          <button
            onClick={handleBulkPublishReady}
            disabled={actionLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-md transition flex items-center gap-1.5"
          >
            <Globe className="w-4 h-4" /> Publish Ready Items
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-300">
          {actionMessage}
        </div>
      )}

      {/* Progress & Stats Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl grid grid-cols-1 sm:grid-cols-4 gap-6">
        <div>
          <div className="text-xs text-slate-400 uppercase font-semibold">Total Progress</div>
          <div className="text-2xl font-extrabold text-white mt-1">{progressPct}%</div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mt-2">
            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400 uppercase font-semibold">Completed Files</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {batch.completedFiles} <span className="text-xs text-slate-400 font-normal">/ {batch.totalFiles}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">{formatBytes(Number(batch.totalBytes))} total</div>
        </div>

        <div>
          <div className="text-xs text-slate-400 uppercase font-semibold">Failed / Cancelled</div>
          <div className="text-2xl font-extrabold text-red-400 mt-1">
            {batch.failedFiles + batch.cancelledFiles}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {batch.failedFiles} failed, {batch.cancelledFiles} cancelled
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400 uppercase font-semibold">Event Target</div>
          <div className="text-base font-bold text-white truncate mt-1">{batch.event.name}</div>
          <div className="text-xs text-indigo-400 mt-2">
            {batch.album ? `Album: ${batch.album.name}` : 'Root Event Gallery'}
          </div>
        </div>
      </div>

      {/* Item Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {['', 'PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === st
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {st === '' ? 'All Items' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search filename..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800">
          {items.length > 0 ? (
            items.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-800/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                    {item.mimeType.startsWith('video/') ? (
                      <Film className="w-4 h-4 text-purple-400" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate max-w-sm sm:max-w-md">
                      {item.fileName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatBytes(Number(item.fileSize))} • {item.mimeType}
                      {item.errorMessage && (
                        <span className="text-red-400 font-medium ml-2">• {item.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'READY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : item.status === 'PROCESSING'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : item.status === 'FAILED'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.status}
                  </span>

                  {item.mediaItem?.isPublished && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                      PUBLISHED
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-slate-400">No items match current filters.</div>
          )}
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total items)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
