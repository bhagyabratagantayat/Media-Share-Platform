'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar,
  Layers,
  Image as ImageIcon,
  MapPin,
  Tag,
  Search,
  Plus,
  ArrowLeft,
  Settings,
  Sparkles,
} from 'lucide-react';

interface EventItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  eventDate: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'ARCHIVED';
  visibility: 'PRIVATE' | 'ORGANISATION' | 'PUBLIC';
  isFeatured?: boolean;
  allowUserUploads: boolean;
  allowDownloads: boolean;
  faceSearchEnabled: boolean;
  _count?: {
    albums: number;
    mediaItems: number;
  };
}

const CATEGORIES = [
  'ALL',
  'ACADEMIC',
  'CULTURAL',
  'SPORTS',
  'TECHNICAL',
  'FESTIVAL',
  'CEREMONY',
  'WORKSHOP',
  'SEMINAR',
  'HACKATHON',
  'OTHER',
];

export default function OrganisationEventsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchEvents = async (cursor?: string, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (search.trim()) queryParams.set('search', search.trim());
      if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
      if (categoryFilter !== 'ALL') queryParams.set('category', categoryFilter);
      if (yearFilter !== 'ALL') queryParams.set('year', yearFilter);
      if (cursor) queryParams.set('cursor', cursor);
      queryParams.set('limit', '12');

      const res = await fetch(`/api/organisations/${slug}/events?${queryParams.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) {
          router.push(`/organisations/${slug}/access`);
          return;
        }
        throw new Error(data.error?.message || 'Failed to load events.');
      }

      if (append) {
        setEvents((prev) => [...prev, ...data.data]);
      } else {
        setEvents(data.data);
      }
      setNextCursor(data.meta?.nextCursor || null);
      setHasMore(Boolean(data.meta?.hasMore));
    } catch (err: any) {
      setError(err.message || 'Something went wrong while fetching events.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetch(`/api/organisations/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.currentMembership) {
          setUserRole(d.data.currentMembership.role);
        }
      })
      .catch(() => {});

    fetchEvents();
  }, [slug, statusFilter, categoryFilter, yearFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents();
  };

  const isStaff =
    userRole &&
    [
      'ORGANISATION_OWNER',
      'ORGANISATION_ADMIN',
      'SOCIAL_MEDIA_MANAGER',
      'SOCIAL_MEDIA_MEMBER',
      'PLATFORM_ADMIN',
    ].includes(userRole);

  const currentYear = new Date().getFullYear();
  const yearOptions = ['ALL', `${currentYear}`, `${currentYear - 1}`, `${currentYear - 2}`, `${currentYear - 3}`];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href={`/organisations/${slug}/dashboard`}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white mt-2">
              Organisation Events & Memories
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Browse festivals, academic events, sports meets, and corporate celebrations.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/organisations/${slug}/calendar`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-semibold text-sm transition"
            >
              <Calendar className="w-4 h-4 text-indigo-400" /> Calendar View
            </Link>
            {isStaff && (
              <Link
                href={`/organisations/${slug}/events/create`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 text-sm transition"
              >
                <Plus className="w-4 h-4" /> Create New Event
              </Link>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex flex-col lg:flex-row gap-4 justify-between items-center">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex gap-2">
            <input
              type="text"
              placeholder="Search by event title, location, or keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" /> Search
            </button>
          </form>

          {/* Filter Selects */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto flex-wrap">
            {/* Year Selector */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr === 'ALL' ? 'All Years' : yr}
                </option>
              ))}
            </select>

            {/* Category Selector */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'All Categories' : cat}
                </option>
              ))}
            </select>

            {/* Status Pills for Staff */}
            {isStaff && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="PUBLISHED">Published</option>
                <option value="ONGOING">Ongoing</option>
                <option value="COMPLETED">Completed</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-800/50 p-4 rounded-2xl text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 h-64 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Events Grid */}
        {!loading && events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => {
              const eventDateObj = new Date(event.startDate || event.eventDate);
              const formattedDate = !isNaN(eventDateObj.getTime())
                ? eventDateObj.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Date not set';

              return (
                <div
                  key={event.id}
                  className="group relative bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 flex flex-col justify-between transition duration-200 shadow-lg hover:shadow-indigo-500/10"
                >
                  <div>
                    {/* Status, Category & Visibility Pills */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-400" /> {formattedDate}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {event.category && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
                            {event.category}
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            event.status === 'PUBLISHED'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                              : event.status === 'ONGOING'
                              ? 'bg-blue-950/60 text-blue-300 border border-blue-800/50'
                              : event.status === 'COMPLETED'
                              ? 'bg-purple-950/60 text-purple-300 border border-purple-800/50'
                              : event.status === 'DRAFT'
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {event.status}
                        </span>
                      </div>
                    </div>

                    <Link href={`/organisations/${slug}/events/${event.slug || event.id}`}>
                      <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition line-clamp-1">
                        {event.name}
                      </h3>
                    </Link>

                    {event.location && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-400" /> <span>{event.location}</span>
                      </p>
                    )}

                    <p className="text-sm text-slate-400 mt-3 line-clamp-2">
                      {event.description || 'No description provided for this event.'}
                    </p>
                  </div>

                  {/* Metadata Stats Footer */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" /> {event._count?.albums ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" /> {event._count?.mediaItems ?? 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isStaff && (
                        <Link
                          href={`/organisations/${slug}/events/${event.id}/manage`}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition"
                        >
                          Manage
                        </Link>
                      )}
                      <Link
                        href={`/organisations/${slug}/events/${event.slug || event.id}`}
                        className="text-indigo-400 group-hover:translate-x-1 transition duration-150 font-medium"
                      >
                        Gallery →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && events.length === 0 && (
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 bg-slate-800/80 text-indigo-400 rounded-2xl flex items-center justify-center text-3xl mx-auto">
              🎉
            </div>
            <h3 className="text-xl font-bold text-white">No Events Found</h3>
            <p className="text-sm text-slate-400">
              {search
                ? `No events matching "${search}" were found. Try another search keyword.`
                : 'There are no events matching the selected filters.'}
            </p>
            {isStaff && (
              <Link
                href={`/organisations/${slug}/events/create`}
                className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
              >
                + Create the First Event
              </Link>
            )}
          </div>
        )}

        {/* Pagination: Load More */}
        {hasMore && (
          <div className="text-center pt-6">
            <button
              onClick={() => fetchEvents(nextCursor || undefined, true)}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition disabled:opacity-50"
            >
              {loadingMore ? 'Loading More Events...' : 'Load More Events ↓'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
