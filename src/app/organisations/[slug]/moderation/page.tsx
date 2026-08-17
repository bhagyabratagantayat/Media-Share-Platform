'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Check,
  X,
  ChevronRight,
  Layers,
  Sparkles,
  FileImage,
  FileVideo,
  User,
  Calendar,
  Lock,
  Globe,
  SlidersHorizontal,
  FolderOpen,
} from 'lucide-react';

interface MediaQueueItem {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO';
  originalFileName: string;
  fileSize: number;
  status: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
  isPublished: boolean;
  requestedVisibility: 'ORGANISATION' | 'PUBLIC';
  faceSearchRequested: boolean;
  rejectionCode?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  uploader: { id: string; name: string; email: string; avatarUrl?: string | null };
  event: { id: string; name: string; slug: string };
  album?: { id: string; name: string; slug: string } | null;
  variants: Array<{ id: string; variantType: string; storageKey: string }>;
}

interface ModerationResponse {
  items: MediaQueueItem[];
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

const REJECTION_REASONS = [
  { code: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate or explicit content' },
  { code: 'LOW_QUALITY', label: 'Low resolution / blurry / poor quality' },
  { code: 'WRONG_EVENT', label: 'Wrong event / unrelated to event' },
  { code: 'DUPLICATE', label: 'Duplicate photo or video' },
  { code: 'PRIVACY_CONCERN', label: 'Privacy or sensitive identity concern' },
  { code: 'UNRELATED_CONTENT', label: 'Spam or marketing content' },
  { code: 'UNSUPPORTED_CONTENT', label: 'Unsupported format or corrupted file' },
  { code: 'OTHER', label: 'Other (specify reason)' },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function OrganisationModerationPage() {
  const params = useParams<{ slug: string }>();

  const [data, setData] = useState<ModerationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [inspectItem, setInspectItem] = useState<MediaQueueItem | null>(null);
  const [rejectModalTarget, setRejectModalTarget] = useState<'single' | 'bulk' | null>(null);
  const [singleRejectId, setSingleRejectId] = useState<string | null>(null);
  const [rejectionCode, setRejectionCode] = useState<string>('INAPPROPRIATE_CONTENT');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchQueue = () => {
    if (!params.slug) return;
    setLoading(true);

    const query = new URLSearchParams({
      page: page.toString(),
      limit: '24',
      status: statusFilter,
      sortBy,
      ...(mediaTypeFilter ? { mediaType: mediaTypeFilter } : {}),
      ...(search ? { search } : {}),
    });

    fetch(`/api/organisations/${params.slug}/moderation?${query.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success && resData.data) {
          setData(resData.data);
          setSelectedIds([]);
        } else {
          setError(resData.error?.message || 'Failed to load moderation queue.');
        }
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, [params.slug, statusFilter, mediaTypeFilter, sortBy, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchQueue();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (!data?.items) return;
    if (selectedIds.length === data.items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.items.map((i) => i.id));
    }
  };

  // Single Actions
  const handleSingleApprove = async (mediaId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/moderation/${mediaId}/approve`,
        { method: 'POST' }
      );
      const resData = await res.json();
      if (res.ok && resData.success) {
        if (inspectItem?.id === mediaId) setInspectItem(null);
        fetchQueue();
      } else {
        alert(resData.error?.message || 'Failed to approve media.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleUnpublish = async (mediaId: string) => {
    if (!confirm('Unpublish this item from the public event gallery?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/moderation/${mediaId}/unpublish`,
        { method: 'POST' }
      );
      const resData = await res.json();
      if (res.ok && resData.success) {
        if (inspectItem?.id === mediaId) setInspectItem(null);
        fetchQueue();
      } else {
        alert(resData.error?.message || 'Failed to unpublish media.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject submission (single or bulk)
  const submitRejection = async () => {
    setActionLoading(true);
    try {
      if (rejectModalTarget === 'single' && singleRejectId) {
        const res = await fetch(
          `/api/organisations/${params.slug}/moderation/${singleRejectId}/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rejectionCode, rejectionReason }),
          }
        );
        const resData = await res.json();
        if (res.ok && resData.success) {
          setRejectModalTarget(null);
          setSingleRejectId(null);
          if (inspectItem?.id === singleRejectId) setInspectItem(null);
          fetchQueue();
        } else {
          alert(resData.error?.message || 'Failed to reject.');
        }
      } else if (rejectModalTarget === 'bulk' && selectedIds.length > 0) {
        const res = await fetch(
          `/api/organisations/${params.slug}/moderation/bulk-reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaIds: selectedIds,
              rejectionCode,
              rejectionReason,
            }),
          }
        );
        const resData = await res.json();
        if (res.ok && resData.success) {
          setRejectModalTarget(null);
          fetchQueue();
        } else {
          alert(resData.error?.message || 'Failed to bulk reject.');
        }
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Approve
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Approve ${selectedIds.length} selected media item(s)?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/moderation/bulk-approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaIds: selectedIds }),
        }
      );
      const resData = await res.json();
      if (res.ok && resData.success) {
        fetchQueue();
      } else {
        alert(resData.error?.message || 'Failed to bulk approve.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              MODERATION CONTROL
            </span>
            <span className="text-xs text-slate-500">Community Safety & Quality</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Media Moderation Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Review user-submitted photos and videos, manage approvals, and enforce event gallery quality standards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchQueue}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh Queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href={`/organisations/${params.slug}/settings/moderation`}
            className="px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span>Upload Settings</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      {data?.counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            onClick={() => {
              setStatusFilter('PENDING');
              setPage(1);
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              statusFilter === 'PENDING'
                ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-950/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 mb-1">
              <span>Pending Review</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-white">{data.counts.pending}</div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('APPROVED');
              setPage(1);
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              statusFilter === 'APPROVED'
                ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 mb-1">
              <span>Approved</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-white">{data.counts.approved}</div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('REJECTED');
              setPage(1);
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              statusFilter === 'REJECTED'
                ? 'bg-red-950/40 border-red-500 shadow-lg shadow-red-950/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-red-400 mb-1">
              <span>Rejected</span>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-white">{data.counts.rejected}</div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              statusFilter === 'ALL'
                ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-950/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-cyan-400 mb-1">
              <span>Total Processed</span>
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-white">{data.counts.total}</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by original filename..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={mediaTypeFilter}
            onChange={(e) => {
              setMediaTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="IMAGE">Photos Only</option>
            <option value="VIDEO">Videos Only</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as 'newest' | 'oldest');
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300 focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          {data?.items && data.items.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
            >
              {selectedIds.length === data.items.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-20 z-30 p-4 rounded-2xl bg-cyan-950/90 border border-cyan-800 backdrop-blur-xl shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold text-white">
              {selectedIds.length} item(s) selected
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkApprove}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Bulk Approve</span>
            </button>
            <button
              onClick={() => setRejectModalTarget('bulk')}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Bulk Reject</span>
            </button>
          </div>
        </div>
      )}

      {/* Items Grid */}
      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`group rounded-2xl bg-slate-900/60 border backdrop-blur-xl transition overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'border-cyan-500 ring-2 ring-cyan-500/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Section */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                          : 'border-slate-700 bg-slate-950 hover:border-slate-500'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.approvalStatus === 'APPROVED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : item.approvalStatus === 'REJECTED'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {item.approvalStatus}
                    </span>
                  </div>

                  {/* Thumbnail / Placeholder */}
                  <div
                    onClick={() => setInspectItem(item)}
                    className="aspect-video rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 relative overflow-hidden cursor-pointer group-hover:border-slate-700"
                  >
                    {item.mediaType === 'VIDEO' ? (
                      <FileVideo className="w-8 h-8 text-indigo-400" />
                    ) : (
                      <FileImage className="w-8 h-8 text-cyan-400" />
                    )}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <Eye className="w-5 h-5 text-white" />
                      <span className="text-xs font-semibold text-white">Inspect</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white truncate" title={item.originalFileName}>
                      {item.originalFileName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Event: <span className="text-slate-300">{item.event.name}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span>{item.uploader.name}</span>
                      <span>• {formatBytes(item.fileSize)}</span>
                    </p>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-2">
                  {item.approvalStatus === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => handleSingleApprove(item.id)}
                        disabled={actionLoading}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => {
                          setSingleRejectId(item.id);
                          setRejectModalTarget('single');
                        }}
                        disabled={actionLoading}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600/80 hover:bg-red-600 transition flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </>
                  ) : item.approvalStatus === 'APPROVED' ? (
                    <button
                      onClick={() => handleSingleUnpublish(item.id)}
                      disabled={actionLoading}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-950/20 transition"
                    >
                      Unpublish from Gallery
                    </button>
                  ) : (
                    <div className="text-[10px] text-red-400 italic truncate w-full text-center">
                      Rejected: {item.rejectionCode?.replace(/_/g, ' ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-4">
          <FolderOpen className="w-12 h-12 mx-auto text-slate-700" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No items in queue</h3>
            <p className="text-xs text-slate-400">
              No submissions match the current status and search filters.
            </p>
          </div>
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-xs text-slate-400">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-white disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page >= data.pagination.totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModalTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span>
                  {rejectModalTarget === 'bulk'
                    ? `Reject ${selectedIds.length} Media Item(s)`
                    : 'Reject Media Submission'}
                </span>
              </h2>
              <button
                onClick={() => setRejectModalTarget(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Rejection Code *
                </label>
                <select
                  value={rejectionCode}
                  onChange={(e) => setRejectionCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Additional Note / Feedback to Member (Optional)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this content was rejected or how the member can adjust their submission..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectModalTarget(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 shadow-md disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Inspection Modal */}
      {inspectItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-cyan-400" />
                <span>Media Item Inspection</span>
              </h2>
              <button
                onClick={() => setInspectItem(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-video rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
              {inspectItem.mediaType === 'VIDEO' ? (
                <FileVideo className="w-12 h-12 text-indigo-400" />
              ) : (
                <FileImage className="w-12 h-12 text-cyan-400" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Uploader</span>
                <p className="font-semibold text-white">{inspectItem.uploader.name}</p>
                <p className="text-slate-400">{inspectItem.uploader.email}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Event Scope</span>
                <p className="font-semibold text-white">{inspectItem.event.name}</p>
                <p className="text-slate-400">
                  {inspectItem.album ? `Album: ${inspectItem.album.name}` : 'No Album'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">File Details</span>
                <p className="font-semibold text-white">{inspectItem.originalFileName}</p>
                <p className="text-slate-400">
                  {formatBytes(inspectItem.fileSize)} • {inspectItem.mediaType}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Preferences</span>
                <p className="font-semibold text-white">
                  Visibility: {inspectItem.requestedVisibility}
                </p>
                <p className="text-slate-400">
                  Face Search Consent: {inspectItem.faceSearchRequested ? 'Granted' : 'Declined'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {inspectItem.approvalStatus === 'PENDING' && (
                <>
                  <button
                    onClick={() => {
                      setSingleRejectId(inspectItem.id);
                      setRejectModalTarget('single');
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleSingleApprove(inspectItem.id)}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition"
                  >
                    Approve & Publish
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
