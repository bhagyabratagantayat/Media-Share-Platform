'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Shield,
  Search,
  ArrowLeft,
  Filter,
  Sparkles,
  Calendar,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Lock,
} from 'lucide-react';

interface SearchMatch {
  mediaId: string;
  mediaType: string;
  thumbnailUrl: string;
  previewUrl?: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  albumId?: string;
  albumName?: string;
  albumSlug?: string;
  createdAt: string;
  matchConfidenceCategory: 'High Confidence' | 'Likely Match';
}

interface EventFilterItem {
  id: string;
  name: string;
  slug: string;
}

export default function FaceDiscoveryResultsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventsList, setEventsList] = useState<EventFilterItem[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<SearchMatch | null>(null);

  const fetchResults = async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/organisations/${slug}/face-discovery/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEventId || undefined,
          limit: 24,
          cursor: cursor || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Search failed');
      }

      if (cursor) {
        setResults((prev) => [...prev, ...data.data.items]);
      } else {
        setResults(data.data.items);
      }

      setTotalMatches(data.data.totalMatches);
      setHasMore(data.data.hasMore);
      setNextCursor(data.data.nextCursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load events for filtering
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/organisations/${slug}/events`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.events) {
          setEventsList(
            data.data.events.map((e: any) => ({
              id: e.id,
              name: e.name,
              slug: e.slug,
            }))
          );
        }
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (slug) {
      fetchResults();
    }
  }, [slug, selectedEventId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/organisations/${slug}/face-discovery`}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h1 className="text-lg font-bold text-white tracking-wide">Find My Photos</h1>
              </div>
              <p className="text-xs text-slate-400">
                Found {totalMatches} photo{totalMatches === 1 ? '' : 's'} matching your face profile
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchResults()}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh Search"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Filter By Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Eligible Events</option>
              {eventsList.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Strictly isolated to your authorized events</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-3 text-red-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Loading State */}
        {loading && results.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Comparing 128D embeddings across approved media...</p>
          </div>
        )}

        {/* Results Grid */}
        {!loading && results.length === 0 && (
          <div className="py-20 text-center space-y-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl p-8 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">No Matching Photos Found</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                We couldn't locate photos matching your face profile in the selected events. This could mean photos from your events haven't been indexed yet or you haven't been photographed in published albums.
              </p>
            </div>
            <Link
              href={`/organisations/${slug}/face-discovery`}
              className="inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
            >
              Manage Biometric Profile
            </Link>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {results.map((match) => (
              <div
                key={match.mediaId}
                onClick={() => setSelectedMatch(match)}
                className="group relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition cursor-pointer flex flex-col shadow-md"
              >
                <div className="aspect-square w-full bg-slate-950 overflow-hidden relative">
                  <img
                    src={match.thumbnailUrl}
                    alt={match.eventName}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  {/* Confidence Badge */}
                  <span
                    className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-md shadow ${
                      match.matchConfidenceCategory === 'High Confidence'
                        ? 'bg-emerald-500/80 text-white'
                        : 'bg-indigo-600/80 text-white'
                    }`}
                  >
                    {match.matchConfidenceCategory}
                  </span>
                </div>

                <div className="p-2.5 space-y-1 bg-slate-900/90">
                  <p className="text-xs font-medium text-white truncate">{match.eventName}</p>
                  {match.albumName && (
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      <span>{match.albumName}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <button
              onClick={() => nextCursor && fetchResults(nextCursor)}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Load More Photos</span>
            </button>
          </div>
        )}
      </main>

      {/* Photo Preview Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl space-y-4">
            <div className="relative aspect-video sm:aspect-[4/3] bg-black flex items-center justify-center">
              <img
                src={selectedMatch.previewUrl || selectedMatch.thumbnailUrl}
                alt={selectedMatch.eventName}
                className="max-h-full max-w-full object-contain"
              />
              <button
                onClick={() => setSelectedMatch(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{selectedMatch.eventName}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      selectedMatch.matchConfidenceCategory === 'High Confidence'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-indigo-500/10 text-indigo-400'
                    }`}
                  >
                    {selectedMatch.matchConfidenceCategory}
                  </span>
                </div>
                {selectedMatch.albumName && (
                  <p className="text-xs text-slate-400 mt-1">Album: {selectedMatch.albumName}</p>
                )}
              </div>

              <Link
                href={`/organisations/${slug}/events/${selectedMatch.eventSlug}`}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                <span>View Full Event Gallery</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
