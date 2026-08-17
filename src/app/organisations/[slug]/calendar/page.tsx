'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Tag,
  Image as ImageIcon,
  Video,
  Layers,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ExternalLink,
  Plus,
  Sparkles,
} from 'lucide-react';

interface CalendarEvent {
  id: string;
  name: string;
  slug: string;
  category: string;
  eventDate: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  coverMediaId: string | null;
  status: string;
  visibility: string;
  isFeatured: boolean;
  allowUserUploads: boolean;
  _count: {
    albums: number;
    mediaItems: number;
  };
}

interface CalendarResponse {
  year: number;
  totalEvents: number;
  events: CalendarEvent[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function OrganisationCalendarPage({
  params,
}: {
  params: { slug: string };
}) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const fetchCalendar = async (year: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/organisations/${params.slug}/calendar?year=${year}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to load calendar events.');
      }
      setCalendarData(data.data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar(selectedYear);
  }, [params.slug, selectedYear]);

  // Group events by month
  const eventsByMonth = React.useMemo(() => {
    const grouped: { [key: number]: CalendarEvent[] } = {};
    for (let i = 0; i < 12; i++) {
      grouped[i] = [];
    }

    if (calendarData?.events) {
      calendarData.events.forEach((ev) => {
        if (selectedCategory !== 'ALL' && ev.category !== selectedCategory) {
          return;
        }
        const d = new Date(ev.startDate || ev.eventDate);
        const month = d.getMonth();
        if (grouped[month]) {
          grouped[month].push(ev);
        }
      });
    }

    return grouped;
  }, [calendarData, selectedCategory]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/organisations/${params.slug}/events`}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-2">
                <CalendarIcon className="w-7 h-7 text-indigo-400" /> Event Calendar & Timeline
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Year-wise institutional event archive and schedule.
              </p>
            </div>
          </div>

          {/* Year Controls & Create Event */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
              <button
                onClick={() => setSelectedYear((prev) => prev - 1)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                title="Previous Year"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-bold text-indigo-400">{selectedYear}</span>
              <button
                onClick={() => setSelectedYear((prev) => prev + 1)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                title="Next Year"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <Link
              href={`/organisations/${params.slug}/events/create`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4" /> New Event
            </Link>
          </div>
        </div>

        {/* Category Filters Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {['ALL', 'ACADEMIC', 'CULTURAL', 'SPORTS', 'TECHNICAL', 'FESTIVAL', 'CEREMONY', 'WORKSHOP', 'SEMINAR', 'HACKATHON', 'OTHER'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Loading events for {selectedYear}...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {MONTHS.map((monthName, monthIndex) => {
              const monthEvents = eventsByMonth[monthIndex] || [];
              if (monthEvents.length === 0) return null;

              return (
                <div key={monthName} className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                      {monthName} {selectedYear}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 font-medium">
                      {monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monthEvents.map((ev) => {
                      const eventStartDate = new Date(ev.startDate || ev.eventDate);
                      return (
                        <div
                          key={ev.id}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all group"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                {ev.category}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                  ev.status === 'PUBLISHED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : ev.status === 'ONGOING'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : ev.status === 'COMPLETED'
                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                }`}
                              >
                                {ev.status}
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-1 mb-2">
                              {ev.name}
                            </h3>

                            <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                              <div className="flex items-center gap-1.5">
                                <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{eventStartDate.toDateString()}</span>
                              </div>
                              {ev.startTime && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>{ev.startTime}</span>
                                </div>
                              )}
                              {ev.location && (
                                <div className="flex items-center gap-1.5 line-clamp-1">
                                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>{ev.location}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                {ev._count?.albums || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                                {ev._count?.mediaItems || 0}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Link
                                href={`/organisations/${params.slug}/events/${ev.id}/manage`}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                              >
                                Manage
                              </Link>
                              <Link
                                href={`/organisations/${params.slug}/events/${ev.slug || ev.id}`}
                                className="p-1 text-slate-400 hover:text-slate-200"
                                title="View Gallery"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {calendarData && calendarData.totalEvents === 0 && (
              <div className="p-16 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-200">No events found for {selectedYear}</h3>
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  There are no scheduled or archived events recorded in this calendar year.
                </p>
                <Link
                  href={`/organisations/${params.slug}/events/create`}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
                >
                  Create Event for {selectedYear}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
