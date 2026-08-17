'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  FolderOpen,
  Filter,
  RefreshCw,
  PlusCircle,
  Eye,
  X,
  FileImage,
  FileVideo,
} from 'lucide-react';

interface SubmissionsResponse {
  items: Array<{
    id: string;
    mediaType: 'IMAGE' | 'VIDEO';
    originalFileName: string;
    fileSize: number;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
    isPublished: boolean;
    requestedVisibility: 'ORGANISATION' | 'PUBLIC';
    rejectionCode?: string | null;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    createdAt: string;
    event: { id: string; name: string; slug: string };
    album?: { id: string; name: string; slug: string } | null;
    variants: Array<{ id: string; variantType: string; storageKey: string }>;
    moderationActions: Array<{
      id: string;
      action: string;
      reasonCode?: string | null;
      note?: string | null;
      createdAt: string;
    }>;
  }>;
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

export default function MySubmissionsPage() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // Resubmit Modal State
  const [resubmitItem, setResubmitItem] = useState<any | null>(null);
  const [resubmitVisibility, setResubmitVisibility] = useState<'ORGANISATION' | 'PUBLIC'>('ORGANISATION');
  const [resubmitFaceSearch, setResubmitFaceSearch] = useState(true);
  const [isResubmitting, setIsResubmitting] = useState(false);

  const fetchSubmissions = () => {
    if (!params.slug) return;
    setLoading(true);

    const query = new URLSearchParams({
      page: page.toString(),
      limit: '20',
      ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    });

    fetch(`/api/organisations/${params.slug}/my-submissions?${query.toString()}`)
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
    fetchSubmissions();
  }, [params.slug, statusFilter, page]);

  const handleResubmit = async () => {
    if (!resubmitItem) return;
    setIsResubmitting(true);

    try {
      const res = await fetch(
        `/api/organisations/${params.slug}/my-submissions/${resubmitItem.id}/resubmit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedVisibility: resubmitVisibility,
            faceSearchRequested: resubmitFaceSearch,
          }),
        }
      );

      const resData = await res.json();
      if (res.ok && resData.success) {
        setResubmitItem(null);
        fetchSubmissions();
      } else {
        alert(resData.error?.message || 'Failed to resubmit.');
      }
    } catch {
      alert('Network error while resubmitting.');
    } finally {
      setIsResubmitting(false);
    }
  };

  const getStatusBadge = (status: string, isPublished: boolean) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isPublished ? 'Approved & Published' : 'Approved (Pending Release)'}</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950 text-red-400 border border-red-800">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Review</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              MY CONTRIBUTIONS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            My Submissions Tracker
          </h1>
          <p className="text-sm text-slate-400">
            Track approval status and moderation feedback for your uploaded event photos and videos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSubmissions}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh submissions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href={`/organisations/${params.slug}/submit`}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Submit Media</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 overflow-x-auto">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
          <button
            key={st}
            onClick={() => {
              setStatusFilter(st);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              statusFilter === st
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {st === 'ALL' ? 'All Submissions' : st}
          </button>
        ))}
      </div>

      {/* Content List */}
      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl hover:border-slate-700 transition space-y-4 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 flex-shrink-0">
                    {item.mediaType === 'VIDEO' ? (
                      <FileVideo className="w-6 h-6 text-indigo-400" />
                    ) : (
                      <FileImage className="w-6 h-6 text-cyan-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white break-all">{item.originalFileName}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span>{item.event.name}</span>
                      {item.album && <span>• Album: {item.album.name}</span>}
                      <span>• {formatBytes(item.fileSize)}</span>
                      <span>• {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(item.approvalStatus, item.isPublished)}
                </div>
              </div>

              {/* Rejection Details & Resubmit Action */}
              {item.approvalStatus === 'REJECTED' && (
                <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/40 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-red-300">
                          Moderation Reason: {item.rejectionCode?.replace(/_/g, ' ') || 'Content did not meet gallery guidelines'}
                        </p>
                        {item.rejectionReason && (
                          <p className="text-slate-300 italic">"{item.rejectionReason}"</p>
                        )}
                        {item.rejectedAt && (
                          <p className="text-[10px] text-slate-500">
                            Reviewed on {new Date(item.rejectedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setResubmitItem(item);
                        setResubmitVisibility(item.requestedVisibility || 'ORGANISATION');
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1.5 flex-shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Resubmit</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
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
        </div>
      ) : (
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-4">
          <FolderOpen className="w-12 h-12 mx-auto text-slate-700" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No submissions found</h3>
            <p className="text-xs text-slate-400">
              {statusFilter !== 'ALL'
                ? `You have no media items with status '${statusFilter}'.`
                : 'You have not submitted any event photos or videos yet.'}
            </p>
          </div>
          <Link
            href={`/organisations/${params.slug}/submit`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Upload Your First Photo/Video</span>
          </Link>
        </div>
      )}

      {/* Resubmit Modal */}
      {resubmitItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Resubmit Media for Review</h2>
              <button
                onClick={() => setResubmitItem(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <p className="font-semibold text-white mb-1">{resubmitItem.originalFileName}</p>
              <p className="text-slate-400">Event: {resubmitItem.event.name}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Target Visibility Preference
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setResubmitVisibility('ORGANISATION')}
                    className={`p-3 rounded-xl border cursor-pointer text-xs font-medium transition ${
                      resubmitVisibility === 'ORGANISATION'
                        ? 'bg-cyan-950/40 border-cyan-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Organisation Only
                  </div>
                  <div
                    onClick={() => setResubmitVisibility('PUBLIC')}
                    className={`p-3 rounded-xl border cursor-pointer text-xs font-medium transition ${
                      resubmitVisibility === 'PUBLIC'
                        ? 'bg-cyan-950/40 border-cyan-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Public Gallery
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resubmitFaceSearch}
                    onChange={(e) => setResubmitFaceSearch(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                  />
                  <span className="text-xs text-slate-300">
                    Consent to Face Discovery when activated
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setResubmitItem(null)}
                disabled={isResubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResubmit}
                disabled={isResubmitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                {isResubmitting ? 'Submitting...' : 'Confirm Resubmission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
