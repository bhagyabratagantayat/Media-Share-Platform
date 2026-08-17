'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Layers,
  ArrowLeft,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';

interface BatchSummary {
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
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function BatchesListPage() {
  const params = useParams<{ slug: string }>();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchBatches = (cursor?: string) => {
    if (!params.slug) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (statusFilter) query.set('status', statusFilter);
    if (cursor) query.set('cursor', cursor);
    query.set('limit', '20');

    fetch(`/api/organisations/${params.slug}/media-team/batches?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (cursor) {
            setBatches((prev) => [...prev, ...data.data]);
          } else {
            setBatches(data.data);
          }
          setNextCursor(data.meta?.nextCursor || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBatches();
  }, [params.slug, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/organisations/${params.slug}/media-team`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Media Team Hub
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Upload Batch History
          </h1>
          <p className="text-sm text-slate-400">
            Audit and manage official media bulk upload pipelines.
          </p>
        </div>

        <Link
          href={`/organisations/${params.slug}/media-team/upload`}
          className="px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
        >
          <UploadCloud className="w-4 h-4" />
          <span>New Bulk Upload</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-400">Filter Status:</span>
        <div className="flex flex-wrap gap-2">
          {['', 'COMPLETED', 'PARTIALLY_FAILED', 'UPLOADING', 'FAILED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === st
                  ? 'bg-cyan-500 text-white shadow-md'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {st === '' ? 'All Batches' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Batches List */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl overflow-hidden shadow-xl">
        {batches.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {batches.map((batch) => {
              const progressPct =
                batch.totalFiles > 0
                  ? Math.round((batch.completedFiles / batch.totalFiles) * 100)
                  : 0;

              return (
                <div
                  key={batch.id}
                  className="p-6 hover:bg-slate-800/30 transition flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-base text-white">{batch.event.name}</span>
                      {batch.album && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-indigo-300">
                          Album: {batch.album.name}
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
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

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span>Created by {batch.creator.name}</span>
                      <span>•</span>
                      <span>{new Date(batch.createdAt).toLocaleString()}</span>
                      <span>•</span>
                      <span>Total Size: {formatBytes(Number(batch.totalBytes))}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="w-44 space-y-1 text-right">
                      <div className="text-xs font-semibold text-slate-300">
                        {batch.completedFiles} of {batch.totalFiles} files ({progressPct}%)
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            batch.status === 'COMPLETED'
                              ? 'bg-emerald-500'
                              : batch.status === 'PARTIALLY_FAILED'
                              ? 'bg-amber-500'
                              : 'bg-cyan-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      {batch.failedFiles > 0 && (
                        <div className="text-[10px] text-red-400 font-semibold">
                          {batch.failedFiles} failed item(s)
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/organisations/${params.slug}/media-team/batches/${batch.id}`}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5"
                    >
                      <span>Manage</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : loading ? (
          <div className="p-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <Layers className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm">No upload batches found matching criteria.</p>
          </div>
        )}
      </div>

      {nextCursor && (
        <div className="text-center pt-4">
          <button
            onClick={() => fetchBatches(nextCursor)}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
          >
            {loading ? 'Loading more...' : 'Load More Batches'}
          </button>
        </div>
      )}
    </div>
  );
}
