'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  Tag,
  Eye,
  UploadCloud,
  Download,
  Star,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'CULTURAL', label: 'Cultural' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'FESTIVAL', label: 'Festival' },
  { value: 'CEREMONY', label: 'Ceremony' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'SEMINAR', label: 'Seminar' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'OTHER', label: 'Other' },
];

export default function CreateEventPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState('ORGANISATION');
  const [status, setStatus] = useState('DRAFT');
  const [isFeatured, setIsFeatured] = useState(false);
  const [allowUserUploads, setAllowUserUploads] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [allowOriginalDownloads, setAllowOriginalDownloads] = useState(false);
  const [allowBulkDownloads, setAllowBulkDownloads] = useState(true);

  // Auto-generate slug preview
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (!startDate) {
      setError('Start date is required.');
      return;
    }
    if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      setError('End date must be on or after start date.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/organisations/${params.slug}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
          category,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          startTime: startTime.trim() || undefined,
          endTime: endTime.trim() || undefined,
          location: location.trim() || undefined,
          status,
          visibility,
          isFeatured,
          allowUserUploads,
          allowDownloads,
          allowOriginalDownloads,
          allowBulkDownloads,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create event.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/organisations/${params.slug}/events/${data.data.id}/manage`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header Breadcrumb */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/organisations/${params.slug}/events`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/40">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-800">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Create New Event</h1>
              <p className="text-sm text-slate-400">
                Plan, organize, and prepare media albums for your organisation activity.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>Event created successfully! Redirecting to event management...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name & Slug */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Event Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Cultural Fest 2026"
                  value={name}
                  onChange={handleNameChange}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  URL Slug
                </label>
                <input
                  type="text"
                  placeholder="annual-cultural-fest-2026"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Brief summary of event highlights and activities..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Category & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" /> Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" /> Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Auditorium / Campus Ground"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Dates & Times */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Start Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" /> End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Start Time (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 09:30 AM"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> End Time (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 05:00 PM"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Visibility & Initial Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" /> Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                >
                  <option value="ORGANISATION">Organisation (Members & Pass Holders)</option>
                  <option value="PUBLIC">Public (Discoverable & Visible to Everyone)</option>
                  <option value="PRIVATE">Private (Restricted to Staff Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                >
                  <option value="DRAFT">Draft (Hidden until published)</option>
                  <option value="PUBLISHED">Published (Visible in gallery/calendar)</option>
                  <option value="ONGOING">Ongoing (Active live event)</option>
                  <option value="COMPLETED">Completed (Archived activities)</option>
                </select>
              </div>
            </div>

            {/* Policy Toggles */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Event Permissions & Options
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={allowUserUploads}
                    onChange={(e) => setAllowUserUploads(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 block">Community Uploads</span>
                    <span className="text-slate-500">Allow users to submit media</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={allowDownloads}
                    onChange={(e) => setAllowDownloads(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 block">General Downloads</span>
                    <span className="text-slate-500">Allow attendees to download media</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={allowBulkDownloads}
                    onChange={(e) => setAllowBulkDownloads(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 block">Bulk ZIP Exports</span>
                    <span className="text-slate-500">Allow multi-file and album ZIP exports</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={allowOriginalDownloads}
                    onChange={(e) => setAllowOriginalDownloads(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 block">Master Original Downloads</span>
                    <span className="text-slate-500">Allow non-staff to download raw camera masters</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 block">Featured Event</span>
                    <span className="text-slate-500">Highlight in overview and carousel</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
              <Link
                href={`/organisations/${params.slug}/events`}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating Event...
                  </>
                ) : (
                  'Create Event'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
