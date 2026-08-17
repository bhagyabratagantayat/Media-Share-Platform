'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function CreateEventPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.slug as string;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugModified, setSlugModified] = useState(false);
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('PUBLISHED');
  const [visibility, setVisibility] = useState<'ORGANISATION' | 'PUBLIC' | 'PRIVATE'>('ORGANISATION');
  const [allowUserUploads, setAllowUserUploads] = useState(false);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [faceSearchEnabled, setFaceSearchEnabled] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!slugModified) {
      const generated = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/organisations/${orgSlug}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description,
          eventDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          location: location || undefined,
          status,
          visibility,
          allowUserUploads,
          allowDownloads,
          faceSearchEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create event.');
      }

      // Navigate to the newly created event
      router.push(`/organisations/${orgSlug}/events/${data.data.slug}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-slate-800/80 pb-6">
          <Link
            href={`/organisations/${orgSlug}/events`}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition flex items-center gap-1 mb-2"
          >
            ← Back to Events List
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Create New Event Space
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Setup an event gallery for festivals, convocations, corporate summits, or sports meets.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-950/50 border border-rose-800 p-4 rounded-xl text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Creation Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-slate-900/60 border border-slate-800/80 p-6 sm:p-8 rounded-2xl">
          {/* Basic Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800/60 pb-2">
              1. Event Details
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Event Title *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Annual Cultural Fest 2026 / Tech Expo"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Event URL Slug *
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugModified(true);
                }}
                placeholder="annual-cultural-fest-2026"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Direct link will be: /organisations/{orgSlug}/events/{slug || '...'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide details about the event schedule, highlights, or guidelines..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>
          </div>

          {/* Schedule & Location */}
          <div className="space-y-4 pt-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800/60 pb-2">
              2. Schedule & Location
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Event Date *
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Venue / Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Auditorium / Sports Complex / Campus Ground"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>
          </div>

          {/* Visibility & Security */}
          <div className="space-y-4 pt-4">
            <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800/60 pb-2">
              3. Privacy & Access Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Publish Status
                </label>
                <select
                  value={status}
                  onChange={(e: any) => setStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                >
                  <option value="PUBLISHED">Published (Visible to members)</option>
                  <option value="DRAFT">Draft (Staff members only)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Audience Scope
                </label>
                <select
                  value={visibility}
                  onChange={(e: any) => setVisibility(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                >
                  <option value="ORGANISATION">Organisation Members & Pass Holders</option>
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Staff Administrators Only</option>
                </select>
              </div>
            </div>

            {/* Feature Flags */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowUserUploads}
                  onChange={(e) => setAllowUserUploads(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-300">
                  Allow regular members and students to contribute photos/videos (User Uploads)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDownloads}
                  onChange={(e) => setAllowDownloads(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-300">
                  Allow members to download media items in full quality
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={faceSearchEnabled}
                  onChange={(e) => setFaceSearchEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-300">
                  Enable AI Face Recognition & Selfie Tagging for this event (Phase 6 Foundation)
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-800/80 flex items-center justify-end gap-4">
            <Link
              href={`/organisations/${orgSlug}/events`}
              className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-medium transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-semibold text-sm shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
            >
              {loading ? 'Creating Event...' : 'Create Event Space →'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
