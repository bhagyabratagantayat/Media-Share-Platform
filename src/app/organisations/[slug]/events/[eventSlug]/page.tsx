'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Upload,
  Download,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  X,
  Sparkles,
  FolderPlus,
  RefreshCw,
  Eye,
  ShieldCheck,
  Archive,
  CheckSquare,
  Square,
  History,
  CheckCircle2,
} from 'lucide-react';
import { BulkExportModal } from '@/components/export/BulkExportModal';
import { ExportHistoryDrawer } from '@/components/export/ExportHistoryDrawer';

interface EventDetail {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  visibility: 'PRIVATE' | 'ORGANISATION' | 'PUBLIC';
  allowUserUploads: boolean;
  allowDownloads: boolean;
  allowOriginalDownloads?: boolean;
  allowBulkDownloads?: boolean;
  faceSearchEnabled: boolean;
  photosCount: number;
  videosCount: number;
  organisation: {
    id: string;
    name: string;
    slug: string;
    allowOriginalDownloads?: boolean;
    allowBulkDownloads?: boolean;
  };
}

interface AlbumItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  status: string;
  _count?: {
    mediaItems: number;
  };
}

interface MediaItem {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO';
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  originalFileSize?: number | null;
  optimizedFileSize?: number | null;
  compressionRatio?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  status: 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
  visibility: 'PUBLIC' | 'ORGANISATION' | 'PRIVATE';
  approvalStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  thumbnailUrl?: string | null;
  optimizedUrl?: string | null;
  createdAt: string;
  album?: {
    id: string;
    name: string;
  } | null;
}

export default function EventGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.slug as string;
  const eventSlug = params?.eventSlug as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [userRole, setUserRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Selection & Export State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState<'SELECTED_MEDIA' | 'ALBUM' | 'EVENT'>('EVENT');
  const [exportTitle, setExportTitle] = useState('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // Modals & Lightbox state
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [albumDesc, setAlbumDesc] = useState('');
  const [savingAlbum, setSavingAlbum] = useState(false);

  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [lightboxOptimizedUrl, setLightboxOptimizedUrl] = useState<string | null>(null);
  const [loadingOptimized, setLoadingOptimized] = useState(false);
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);
  const [downloadingOptimized, setDownloadingOptimized] = useState(false);

  // Fetch Event & Albums
  const loadEventAndAlbums = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch event search
      const res = await fetch(`/api/organisations/${orgSlug}/events?search=${eventSlug}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) {
          router.push(`/organisations/${orgSlug}/access`);
          return;
        }
        throw new Error(data.error?.message || 'Failed to load event.');
      }

      const foundEvent = data.data.find((e: any) => e.slug === eventSlug);
      if (!foundEvent) {
        throw new Error('Event not found.');
      }

      // 2. Fetch full event details
      const detailRes = await fetch(`/api/events/${foundEvent.id}`);
      const detailData = await detailRes.json();
      if (!detailRes.ok || !detailData.success) {
        throw new Error(detailData.error?.message || 'Failed to load event details.');
      }
      setEvent(detailData.data);

      // 3. Fetch albums for this event
      const albumRes = await fetch(`/api/events/${foundEvent.id}/albums`);
      const albumData = await albumRes.json();
      if (albumRes.ok && albumData.success) {
        setAlbums(albumData.data);
      }

      // 4. Fetch initial media items
      await fetchMedia(foundEvent.id, null, 'ALL');
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMedia = async (
    eventId: string,
    albumId: string | null,
    typeFilter: 'ALL' | 'IMAGE' | 'VIDEO',
    cursor?: string,
    append = false
  ) => {
    try {
      if (append) setLoadingMore(true);
      const queryParams = new URLSearchParams();
      if (albumId) queryParams.set('albumId', albumId);
      if (typeFilter !== 'ALL') queryParams.set('mediaType', typeFilter);
      if (cursor) queryParams.set('cursor', cursor);
      queryParams.set('limit', '24');

      const res = await fetch(`/api/events/${eventId}/media?${queryParams.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        if (append) {
          setMediaList((prev) => [...prev, ...data.data]);
        } else {
          setMediaList(data.data);
        }
        setNextCursor(data.meta?.nextCursor || null);
        setHasMore(Boolean(data.meta?.hasMore));
      }
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetch(`/api/organisations/${orgSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.currentMembership) {
          setUserRole(d.data.currentMembership.role);
        }
      })
      .catch(() => {});

    loadEventAndAlbums();
  }, [orgSlug, eventSlug]);

  const handleAlbumSelect = (albumId: string | null) => {
    setSelectedAlbumId(albumId);
    setSelectedMediaIds([]);
    if (event) {
      fetchMedia(event.id, albumId, selectedMediaType);
    }
  };

  const handleTypeSelect = (type: 'ALL' | 'IMAGE' | 'VIDEO') => {
    setSelectedMediaType(type);
    setSelectedMediaIds([]);
    if (event) {
      fetchMedia(event.id, selectedAlbumId, type);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setSavingAlbum(true);
    try {
      const res = await fetch(`/api/events/${event.id}/albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: albumName,
          description: albumDesc,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create album.');
      }
      setAlbums((prev) => [...prev, data.data]);
      setShowAlbumModal(false);
      setAlbumName('');
      setAlbumDesc('');
    } catch (err: any) {
      alert(err.message || 'Failed to create album.');
    } finally {
      setSavingAlbum(false);
    }
  };

  const toggleSelectMedia = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedMediaIds.length === mediaList.length) {
      setSelectedMediaIds([]);
    } else {
      setSelectedMediaIds(mediaList.map((m) => m.id));
    }
  };

  const openExportModal = (scope: 'SELECTED_MEDIA' | 'ALBUM' | 'EVENT', title?: string) => {
    setExportScope(scope);
    setExportTitle(title || '');
    setShowExportModal(true);
  };

  const handleOpenLightbox = async (item: MediaItem) => {
    if (isSelectMode) {
      toggleSelectMedia(item.id);
      return;
    }

    setLightboxMedia(item);
    setLightboxOptimizedUrl(item.optimizedUrl || null);

    if (!item.optimizedUrl && item.status === 'READY') {
      try {
        setLoadingOptimized(true);
        const res = await fetch(`/api/media/${item.id}/access?variant=OPTIMIZED`);
        const data = await res.json();
        if (res.ok && data.success && data.data?.url) {
          setLightboxOptimizedUrl(data.data.url);
        }
      } catch (err) {
        console.error('Failed to load optimized variant:', err);
      } finally {
        setLoadingOptimized(false);
      }
    }
  };

  const handleDownload = async (mediaId: string, isOriginal: boolean) => {
    try {
      if (isOriginal) setDownloadingOriginal(true);
      else setDownloadingOptimized(true);

      const res = await fetch(
        `/api/media/${mediaId}/download?${isOriginal ? 'variant=ORIGINAL' : 'variant=OPTIMIZED'}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to generate signed download link.');
      }
      window.open(data.data.downloadUrl, '_blank');
    } catch (err: any) {
      alert(err.message || 'Download failed.');
    } finally {
      if (isOriginal) setDownloadingOriginal(false);
      else setDownloadingOptimized(false);
    }
  };

  const isStaff =
    userRole &&
    [
      'ORGANISATION_OWNER',
      'ORGANISATION_ADMIN',
      'SOCIAL_MEDIA_MANAGER',
      'MODERATOR',
      'PLATFORM_ADMIN',
    ].includes(userRole);

  const canUpload = isStaff || (event && event.allowUserUploads);
  const canBulkDownload = event?.allowBulkDownloads !== false && event?.allowDownloads !== false;
  const canDownloadOriginal = isStaff || event?.allowOriginalDownloads === true;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Loading CDN gallery memories...</p>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <h2 className="text-xl font-bold text-rose-400">Event Not Available</h2>
          <p className="text-sm text-slate-400">{error || 'Event could not be loaded.'}</p>
          <Link
            href={`/organisations/${orgSlug}/events`}
            className="inline-block px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition"
          >
            ← Back to Events
          </Link>
        </div>
      </main>
    );
  }

  const eventDateObj = new Date(event.eventDate);
  const formattedDate = !isNaN(eventDateObj.getTime())
    ? eventDateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Breadcrumbs & History Action */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Link href={`/organisations/${orgSlug}/events`} className="hover:text-indigo-400 transition">
              Events
            </Link>
            <span>/</span>
            <span className="text-slate-200 font-medium">{event.name}</span>
          </div>

          <button
            onClick={() => setShowHistoryDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-medium transition"
          >
            <History className="w-3.5 h-3.5 text-violet-400" />
            Export History
          </button>
        </div>

        {/* Event Hero Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  📅 {formattedDate}
                </span>
                {event.location && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    📍 {event.location}
                  </span>
                )}
                {event.faceSearchEnabled && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Face Search Ready
                  </span>
                )}
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Direct CDN Delivery
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {event.name}
              </h1>

              {event.description && (
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  {event.description}
                </p>
              )}

              {/* Stats badges */}
              <div className="flex items-center gap-3 pt-2 text-xs font-medium text-slate-400">
                <span className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  📷 {event.photosCount} Photos
                </span>
                <span className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  🎬 {event.videosCount} Videos
                </span>
                <span className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  📁 {albums.length} Albums
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-3">
              {canUpload && (
                <Link
                  href={`/organisations/${orgSlug}/events/${eventSlug}/upload`}
                  className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Direct S3 Upload
                </Link>
              )}

              {canBulkDownload && (
                <button
                  onClick={() => openExportModal('EVENT', `Entire ${event.name} Event Archive`)}
                  className="px-4 py-2.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-xs font-semibold border border-violet-500/30 transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Archive className="w-4 h-4 text-violet-400" />
                  Export All Event (.ZIP)
                </button>
              )}

              {isStaff && (
                <button
                  onClick={() => setShowAlbumModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition flex items-center justify-center gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  + Add Album Folder
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation, Filters & Batch Selection Bar */}
        <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Albums Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            <button
              onClick={() => handleAlbumSelect(null)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                selectedAlbumId === null
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              All Media ({event.photosCount + event.videosCount})
            </button>

            {albums.map((alb) => (
              <button
                key={alb.id}
                onClick={() => handleAlbumSelect(alb.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  selectedAlbumId === alb.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                📁 {alb.name}
              </button>
            ))}
          </div>

          {/* Right Controls: Filters & Select Mode */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Media Type Switcher */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {(['ALL', 'IMAGE', 'VIDEO'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    selectedMediaType === type
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type === 'IMAGE' ? '📷 Photos' : '🎬 Videos'}
                </button>
              ))}
            </div>

            {/* Batch Select Toggle */}
            <button
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedMediaIds([]);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
                isSelectMode
                  ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isSelectMode ? <CheckSquare className="w-3.5 h-3.5 text-violet-400" /> : <Square className="w-3.5 h-3.5" />}
              {isSelectMode ? 'Cancel Select' : 'Select'}
            </button>

            {/* Album-level Export Button */}
            {selectedAlbumId && canBulkDownload && (
              <button
                onClick={() => {
                  const alb = albums.find((a) => a.id === selectedAlbumId);
                  openExportModal('ALBUM', `Album: ${alb?.name || 'Selected Album'}`);
                }}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                Export Album
              </button>
            )}
          </div>
        </div>

        {/* Floating Batch Actions Bar */}
        {isSelectMode && selectedMediaIds.length > 0 && (
          <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 animate-in slide-in-from-bottom-5 duration-200">
            <div className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-center gap-4 text-zinc-100 max-w-xl w-full justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-300 bg-zinc-800 px-3 py-1 rounded-lg">
                  {selectedMediaIds.length} selected
                </span>
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                >
                  {selectedMediaIds.length === mediaList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openExportModal('SELECTED_MEDIA', `${selectedMediaIds.length} Selected Items`)}
                  disabled={!canBulkDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition shadow-lg shadow-violet-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download ZIP ({selectedMediaIds.length})
                </button>
                <button
                  onClick={() => setSelectedMediaIds([])}
                  className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-900 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CDN Gallery Grid */}
        {mediaList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {mediaList.map((item) => {
              const isSelected = selectedMediaIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleOpenLightbox(item)}
                  className={`group relative bg-slate-900 border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 aspect-square flex flex-col justify-between shadow-md ${
                    isSelected
                      ? 'border-violet-500 ring-2 ring-violet-500/50 scale-[0.98]'
                      : 'border-slate-800/80 hover:border-indigo-500/60 hover:shadow-indigo-500/10'
                  }`}
                >
                  {/* Background Thumbnail Image or Video Poster */}
                  {item.thumbnailUrl && item.status === 'READY' ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.originalFileName}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-4 text-center">
                      <span className="text-3xl mb-1">
                        {item.mediaType === 'IMAGE' ? '🖼️' : '🎥'}
                      </span>
                      <span className="text-[10px] font-mono text-amber-400">
                        {item.status}
                      </span>
                    </div>
                  )}

                  {/* Dark Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-black/40 opacity-70 group-hover:opacity-90 transition" />

                  {/* Top Badge / Select Checkbox */}
                  <div className="relative z-10 p-2.5 flex items-center justify-between">
                    {isSelectMode ? (
                      <button
                        type="button"
                        onClick={(e) => toggleSelectMedia(item.id, e)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-violet-600 text-white shadow'
                            : 'bg-black/60 border border-white/20 text-transparent hover:border-white/40'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 fill-current" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/70 backdrop-blur-md text-slate-200 border border-white/10">
                        {item.mediaType === 'IMAGE' ? 'PHOTO' : 'VIDEO'}
                      </span>
                    )}

                    {item.mediaType === 'VIDEO' && (
                      <span className="w-6 h-6 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow">
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      </span>
                    )}
                  </div>

                  {/* Bottom Metadata */}
                  <div className="relative z-10 p-2.5 space-y-0.5">
                    <p className="text-xs font-semibold text-white truncate drop-shadow-md">
                      {item.originalFileName}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-300 drop-shadow">
                      <span>{(Number(item.fileSize) / (1024 * 1024)).toFixed(1)} MB</span>
                      <span className="text-indigo-300 font-semibold group-hover:underline">
                        View →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty Gallery State */
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 bg-slate-800 text-indigo-400 rounded-2xl flex items-center justify-center text-3xl mx-auto">
              📸
            </div>
            <h3 className="text-xl font-bold text-white">No Media Uploaded Yet</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              This gallery is connected directly to fast CDN edge caching. Upload memories to view optimized photos and streaming videos.
            </p>
            {canUpload && (
              <Link
                href={`/organisations/${orgSlug}/events/${eventSlug}/upload`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/20"
              >
                <Upload className="w-4 h-4" />
                Upload Photos & Videos
              </Link>
            )}
          </div>
        )}

        {/* Load More Pagination */}
        {hasMore && (
          <div className="text-center pt-6">
            <button
              onClick={() =>
                event &&
                fetchMedia(
                  event.id,
                  selectedAlbumId,
                  selectedMediaType,
                  nextCursor || undefined,
                  true
                )
              }
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-800 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading More...
                </>
              ) : (
                'Load More Memories ↓'
              )}
            </button>
          </div>
        )}

        {/* Lightbox / Media Viewer Modal */}
        {lightboxMedia && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="relative bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                <div className="truncate max-w-md">
                  <h3 className="text-base font-bold text-white truncate">
                    {lightboxMedia.originalFileName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lightboxMedia.width && lightboxMedia.height
                      ? `${lightboxMedia.width}×${lightboxMedia.height} px • `
                      : ''}
                    {(Number(lightboxMedia.fileSize) / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => {
                    setLightboxMedia(null);
                    setLightboxOptimizedUrl(null);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Media Display Area */}
              <div className="flex-1 min-h-[300px] max-h-[60vh] bg-slate-950 flex items-center justify-center p-4 overflow-hidden relative">
                {lightboxMedia.mediaType === 'IMAGE' ? (
                  lightboxOptimizedUrl || lightboxMedia.thumbnailUrl ? (
                    <img
                      src={lightboxOptimizedUrl || lightboxMedia.thumbnailUrl || ''}
                      alt={lightboxMedia.originalFileName}
                      className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg transition duration-300"
                    />
                  ) : (
                    <div className="text-center text-slate-400">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">Image is processing...</p>
                    </div>
                  )
                ) : lightboxOptimizedUrl ? (
                  <video
                    src={lightboxOptimizedUrl}
                    controls
                    preload="metadata"
                    poster={lightboxMedia.thumbnailUrl || undefined}
                    className="max-h-[55vh] max-w-full rounded-xl shadow-lg bg-black"
                  >
                    Your browser does not support HTML5 video streaming.
                  </video>
                ) : (
                  <div className="text-center text-slate-400">
                    <VideoIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Optimizing video for streaming...</p>
                  </div>
                )}

                {loadingOptimized && (
                  <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Loading high-res WebP...
                  </div>
                )}
              </div>

              {/* Footer Actions & Metadata */}
              <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px]">
                    Status: {lightboxMedia.status}
                  </span>
                  {lightboxMedia.compressionRatio && (
                    <span className="text-emerald-400">
                      ⚡ {lightboxMedia.compressionRatio}x compression
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {event.allowDownloads && (
                    <>
                      <button
                        onClick={() => handleDownload(lightboxMedia.id, false)}
                        disabled={downloadingOptimized}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloadingOptimized ? 'Signing...' : 'Download WebP'}
                      </button>

                      {canDownloadOriginal && (
                        <button
                          onClick={() => handleDownload(lightboxMedia.id, true)}
                          disabled={downloadingOriginal}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingOriginal ? 'Signing...' : 'Download Master Original'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Bulk Export */}
        <BulkExportModal
          isOpen={showExportModal}
          onClose={() => {
            setShowExportModal(false);
            setSelectedMediaIds([]);
          }}
          orgSlug={orgSlug}
          scopeType={exportScope}
          eventId={event.id}
          albumId={selectedAlbumId || undefined}
          selectedMediaIds={selectedMediaIds}
          scopeTitle={exportTitle}
          canDownloadOriginal={canDownloadOriginal}
        />

        {/* Drawer: Export History */}
        <ExportHistoryDrawer
          isOpen={showHistoryDrawer}
          onClose={() => setShowHistoryDrawer(false)}
          orgSlug={orgSlug}
        />

        {/* Modal: Create Album Folder */}
        {showAlbumModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <h3 className="text-lg font-bold text-white">Create New Album Folder</h3>
              <form onSubmit={handleCreateAlbum} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Album Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={albumName}
                    onChange={(e) => setAlbumName(e.target.value)}
                    placeholder="e.g. Stage Performance / Prize Distribution"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={albumDesc}
                    onChange={(e) => setAlbumDesc(e.target.value)}
                    placeholder="Optional description for this album segment..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAlbumModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingAlbum}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow"
                  >
                    {savingAlbum ? 'Creating...' : 'Create Album'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
