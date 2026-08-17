'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  UploadCloud,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Users,
  ArrowRight,
  RefreshCw,
  FolderOpen,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface MediaTeamStats {
  activeBatchesCount: number;
  processingCount: number;
  readyCount: number;
  failedCount: number;
  totalMediaCount: number;
  storage: {
    limitBytes: number;
    usedBytes: number;
    reservedBytes: number;
    percentage: number;
  };
  recentBatches: Array<{
    id: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    createdAt: string;
    event: { name: string; slug: string };
    creator: { name: string };
  }>;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function MediaTeamDashboardPage() {
  const params = useParams<{ slug: string }>();
  const [stats, setStats] = useState<MediaTeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = () => {
    if (!params.slug) return;
    setLoading(true);
    fetch(`/api/organisations/${params.slug}/media-team/stats`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setStats(data.data);
        } else {
          setError(data.error?.message || 'Failed to load team metrics.');
        }
      })
      .catch(() => setError('Network error loading statistics.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, [params.slug]);

  if (loading && !stats) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="max-w-md mx-auto my-auto px-4 py-16 text-center">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-sm text-slate-400 mb-6">{error}</p>
        <Link
          href={`/organisations/${params.slug}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700"
        >
          Back to Organisation
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              OFFICIAL MEDIA WORKFLOW
            </span>
            <span className="text-xs text-slate-500 font-mono">500+ Concurrent Ready</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Social Media Team Hub
          </h1>
          <p className="text-sm text-slate-400">
            Bulk upload official event media, monitor batch pipelines, and manage publication queues.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh statistics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href={`/organisations/${params.slug}/media-team/upload`}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span>New Bulk Upload</span>
          </Link>
        </div>
      </div>

      {/* Storage & Pipeline Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Storage Quota Card */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Storage Usage</span>
              <HardDrive className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">
                {formatBytes(stats.storage.usedBytes)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                of {formatBytes(stats.storage.limitBytes)} allocated ({stats.storage.percentage}%)
              </div>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  stats.storage.percentage > 90
                    ? 'bg-red-500'
                    : stats.storage.percentage > 75
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, stats.storage.percentage))}%` }}
              />
            </div>
          </div>

          {/* Active Batches */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Batches</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.activeBatchesCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">In-flight direct upload batches</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-indigo-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Direct to Object Storage</span>
            </div>
          </div>

          {/* Processing Queue */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Processing Queue</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.processingCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">Compressing & optimizing variants</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Background Workers</span>
            </div>
          </div>

          {/* Published & Ready Media */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ready / Published</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.readyCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Total {stats.totalMediaCount} items indexed
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Available on CDN Edge</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Quick Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/organisations/${params.slug}/media-team/upload`}
          className="group p-6 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-800/40 hover:border-cyan-500/60 transition-all shadow-lg"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1 flex items-center justify-between">
            <span>Bulk Upload Center</span>
            <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Drag & drop hundreds of photos and videos. Direct-to-storage concurrency with automatic retry and auto-publish.
          </p>
        </Link>

        <Link
          href={`/organisations/${params.slug}/media-team/batches`}
          className="group p-6 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-800/40 hover:border-indigo-500/60 transition-all shadow-lg"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-105 transition-transform">
            <FolderOpen className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1 flex items-center justify-between">
            <span>Upload Batch History</span>
            <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Inspect previous upload sessions, view file-by-file status, retry failed items, or trigger manual bulk publishing.
          </p>
        </Link>

        <Link
          href={`/organisations/${params.slug}/settings/team`}
          className="group p-6 rounded-2xl bg-gradient-to-br from-slate-950/60 via-slate-900 to-slate-900 border border-slate-800 hover:border-slate-700 transition-all shadow-lg"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 mb-4 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1 flex items-center justify-between">
            <span>Team & Permissions</span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Manage Social Media Managers and Members. Assign granular upload, album, and publication rights.
          </p>
        </Link>
      </div>

      {/* Recent Batches Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Recent Upload Batches</h2>
            <p className="text-xs text-slate-400">Latest bulk uploads initiated by your team</p>
          </div>
          <Link
            href={`/organisations/${params.slug}/media-team/batches`}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            View all batches <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {stats?.recentBatches && stats.recentBatches.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {stats.recentBatches.map((batch) => {
              const progressPct =
                batch.totalFiles > 0
                  ? Math.round((batch.completedFiles / batch.totalFiles) * 100)
                  : 0;

              return (
                <div
                  key={batch.id}
                  className="p-5 hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{batch.event.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
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
                    <p className="text-xs text-slate-400">
                      Uploaded by {batch.creator.name} • {new Date(batch.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="w-36 space-y-1 text-right">
                      <div className="text-xs font-medium text-slate-300">
                        {batch.completedFiles} / {batch.totalFiles} files ({progressPct}%)
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-cyan-500 rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <Link
                      href={`/organisations/${params.slug}/media-team/batches/${batch.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <UploadCloud className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm">No upload batches found yet.</p>
            <Link
              href={`/organisations/${params.slug}/media-team/upload`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              Start your first bulk upload <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
