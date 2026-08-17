'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileImage,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Sparkles,
  ArrowRight,
  Info,
  X,
  Lock,
  Globe,
  Users,
  Eye,
  Check,
  ChevronRight,
} from 'lucide-react';

interface EventItem {
  id: string;
  name: string;
  slug: string;
  allowUserUploads: boolean;
  albums?: Array<{ id: string; name: string }>;
}

interface OrgSettings {
  allowUserUploads: boolean;
  requireUserUploadApproval: boolean;
  allowUserVideoUploads: boolean;
  allowUserPhotoUploads: boolean;
  maxUserFilesPerBatch: number;
  maxUserImageSize: number;
  maxUserVideoSize: number;
  maxUserUploadsPerDay: number;
}

interface UploadFileState {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
  mediaItemId?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function UserSubmitMediaPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form preferences
  const [requestedVisibility, setRequestedVisibility] = useState<'ORGANISATION' | 'PUBLIC'>('ORGANISATION');
  const [faceSearchRequested, setFaceSearchRequested] = useState<boolean>(true);

  // Upload queue
  const [files, setFiles] = useState<UploadFileState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!params.slug) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/organisations/${params.slug}/events`).then((r) => r.json()),
      fetch(`/api/organisations/${params.slug}/upload-settings`).then((r) => r.json()),
    ])
      .then(([eventsData, settingsData]) => {
        if (eventsData.success && eventsData.data) {
          const activeEvents = eventsData.data.filter((e: any) => e.allowUserUploads !== false);
          setEvents(activeEvents);
          if (activeEvents.length > 0) {
            setSelectedEventId(activeEvents[0].id);
          }
        }
        if (settingsData.success && settingsData.data) {
          setOrgSettings(settingsData.data);
        }
      })
      .catch((err) => {
        setError('Failed to load organisation submission configurations.');
      })
      .finally(() => setLoading(false));
  }, [params.slug]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedList = Array.from(e.target.files);

    const maxBatch = orgSettings?.maxUserFilesPerBatch || 20;
    if (files.length + selectedList.length > maxBatch) {
      alert(`You can upload a maximum of ${maxBatch} files per submission.`);
      return;
    }

    const newFiles: UploadFileState[] = selectedList.map((file) => ({
      file,
      id: Math.random().toString(36).substring(2, 9),
      progress: 0,
      status: 'pending',
    }));

    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const startUpload = async () => {
    if (!selectedEventId) {
      alert('Please select an event.');
      return;
    }

    if (files.length === 0) {
      alert('Please select at least one photo or video to upload.');
      return;
    }

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status === 'completed') continue;

      // Update item to uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', progress: 10 } : f))
      );

      try {
        // Step 1: Create Upload Session
        const sessionRes = await fetch('/api/uploads/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organisationSlug: params.slug,
            eventId: selectedEventId,
            albumId: selectedAlbumId || undefined,
            fileName: item.file.name,
            mimeType: item.file.type || 'image/jpeg',
            fileSize: item.file.size,
            requestedVisibility,
            faceSearchRequested,
          }),
        });

        const sessionData = await sessionRes.json();
        if (!sessionRes.ok || !sessionData.success) {
          throw new Error(sessionData.error?.message || 'Failed to create upload session.');
        }

        const session = sessionData.data;

        // Step 2: Upload direct to object storage
        if (!session.isMultipart && session.uploadUrl) {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', session.uploadUrl);
            xhr.setRequestHeader('Content-Type', item.file.type || 'image/jpeg');

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 75) + 15;
                setFiles((prev) =>
                  prev.map((f) => (f.id === item.id ? { ...f, progress: percent } : f))
                );
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Storage returned HTTP ${xhr.status}`));
              }
            };

            xhr.onerror = () => reject(new Error('Network error uploading to storage.'));
            xhr.send(item.file);
          });
        }

        // Step 3: Complete upload
        const completeRes = await fetch('/api/uploads/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadSessionId: session.uploadSessionId,
          }),
        });

        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.success) {
          throw new Error(completeData.error?.message || 'Failed to finalize upload.');
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'completed',
                  progress: 100,
                  mediaItemId: session.mediaItemId,
                }
              : f
          )
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'failed',
                  error: err.message || 'Upload failed.',
                }
              : f
          )
        );
      }
    }

    setIsUploading(false);
    setIsCompleted(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (orgSettings && !orgSettings.allowUserUploads) {
    return (
      <div className="max-w-md mx-auto my-auto px-4 py-16 text-center">
        <Shield className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Submissions Closed</h2>
        <p className="text-sm text-slate-400 mb-6">
          Community member submissions are currently disabled by the organisation administrators.
        </p>
        <Link
          href={`/organisations/${params.slug}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700"
        >
          Return to Organisation
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header & Policy Notice */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            COMMUNITY CONTRIBUTION
          </span>
          <span className="text-xs text-slate-500">
            {orgSettings?.requireUserUploadApproval ? 'Admin Moderation Active' : 'Instant Publishing'}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Submit Event Photos & Videos
        </h1>
        <p className="text-sm text-slate-400">
          Share your memories with the organisation. All submissions are safely processed and isolated to this organisation.
        </p>

        {orgSettings?.requireUserUploadApproval && (
          <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-3">
            <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-cyan-300">Moderation Review Policy</p>
              <p>
                To maintain event gallery quality, submissions will be reviewed by organisation moderators before appearing in public galleries. You can track approval progress in your submissions tracker.
              </p>
            </div>
          </div>
        )}
      </div>

      {isCompleted ? (
        /* Success State */
        <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Submissions Successfully Uploaded!</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Your media is being processed by background workers.
              {orgSettings?.requireUserUploadApproval
                ? ' Administrators have been notified to review your contribution.'
                : ' Your media is now published.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={`/organisations/${params.slug}/my-submissions`}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
            >
              <span>View My Submissions</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => {
                setFiles([]);
                setIsCompleted(false);
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
            >
              Submit More Media
            </button>
          </div>
        </div>
      ) : (
        /* Upload Form */
        <div className="space-y-6">
          {/* Target Event Selection */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">1. Destination Event</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Event *</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    setSelectedAlbumId('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500 transition"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEvent?.albums && selectedEvent.albums.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Album (Optional)</label>
                  <select
                    value={selectedAlbumId}
                    onChange={(e) => setSelectedAlbumId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500 transition"
                  >
                    <option value="">None (General Event Gallery)</option>
                    {selectedEvent.albums.map((alb) => (
                      <option key={alb.id} value={alb.id}>
                        {alb.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Privacy & Face Discovery Preferences */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">2. Privacy & Discovery</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setRequestedVisibility('ORGANISATION')}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  requestedVisibility === 'ORGANISATION'
                    ? 'bg-cyan-950/40 border-cyan-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">Organisation Only</span>
                </div>
                <p className="text-xs text-slate-400">Visible only to authenticated members of this organisation.</p>
              </div>

              <div
                onClick={() => setRequestedVisibility('PUBLIC')}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  requestedVisibility === 'PUBLIC'
                    ? 'bg-cyan-950/40 border-cyan-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-white">Public Gallery</span>
                </div>
                <p className="text-xs text-slate-400">Visible to event attendees and public viewers upon approval.</p>
              </div>
            </div>

            {/* Face Discovery Future Preparation */}
            <div className="pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition cursor-pointer">
                <input
                  type="checkbox"
                  checked={faceSearchRequested}
                  onChange={(e) => setFaceSearchRequested(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="text-xs space-y-0.5">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Enable Face Discovery (Future Feature)
                  </span>
                  <p className="text-slate-400">
                    Consent to face-based search indexing when facial recognition is activated. No biometric processing occurs today.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Media Files Selection Dropzone */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">3. Select Photos & Videos</h2>
              <span className="text-xs text-slate-500">
                Max {orgSettings?.maxUserFilesPerBatch || 20} files per submission
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-cyan-500/60 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-3 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Click to select files or drag & drop</p>
              <p className="text-xs text-slate-400">
                JPEG, PNG, WebP, HEIC, MP4, MOV, WebM (Photos up to {formatBytes(orgSettings?.maxUserImageSize || 25 * 1024 * 1024)}, Videos up to {formatBytes(orgSettings?.maxUserVideoSize || 200 * 1024 * 1024)})
              </p>
            </div>

            {/* Selected File List */}
            {files.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Selected Files ({files.length})</span>
                  <button
                    onClick={() => setFiles([])}
                    disabled={isUploading}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 rounded-xl bg-slate-950 border border-slate-800">
                  {files.map((item) => {
                    const isVideo = item.file.type.startsWith('video/');
                    return (
                      <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isVideo ? (
                            <FileVideo className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          ) : (
                            <FileImage className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{item.file.name}</p>
                            <p className="text-[10px] text-slate-500">{formatBytes(item.file.size)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {item.status === 'uploading' && (
                            <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-500 rounded-full transition-all"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                          {item.status === 'completed' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {item.status === 'failed' && (
                            <span title={item.error || 'Upload failed'}>
                              <AlertCircle className="w-4 h-4 text-red-400" />
                            </span>
                          )}
                          {item.status === 'pending' && !isUploading && (
                            <button
                              onClick={() => removeFile(item.id)}
                              className="text-slate-500 hover:text-red-400 p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Submit Action Button */}
          <div className="flex items-center justify-end gap-4 pt-2">
            <Link
              href={`/organisations/${params.slug}`}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </Link>
            <button
              onClick={startUpload}
              disabled={isUploading || files.length === 0}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Uploading {files.filter((f) => f.status === 'uploading').length}/{files.length}...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Submit {files.length > 0 ? `(${files.length} files)` : ''}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
