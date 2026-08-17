'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Search,
  Calendar,
  MapPin,
  FolderOpen,
  ArrowRight,
  Layers,
  FileImage,
  FileVideo,
  X,
} from 'lucide-react';
import GalleryGrid from '@/components/gallery/GalleryGrid';
import { GalleryMediaItem } from '@/components/gallery/MediaCard';

interface SearchResults {
  query: string;
  events: Array<{
    id: string;
    name: string;
    slug: string;
    eventDate: string;
    location?: string | null;
  }>;
  albums: Array<{
    id: string;
    name: string;
    slug: string;
    event: { id: string; name: string; slug: string };
  }>;
  media: GalleryMediaItem[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    returnedCount: number;
  };
}

export default function OrganisationSearchPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [mediaType, setMediaType] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const performSearch = useCallback(
    async (cursor?: string, append = false) => {
      if (!params.slug) return;

      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const qParams = new URLSearchParams({
        limit: '30',
        ...(query ? { q: query } : {}),
        ...(selectedYear ? { year: selectedYear.toString() } : {}),
        ...(mediaType !== 'ALL' ? { mediaType } : {}),
        ...(cursor ? { cursor } : {}),
      });

      try {
        const res = await fetch(`/api/organisations/${params.slug}/search?${qParams.toString()}`);
        const resData = await res.json();

        if (resData.success && resData.data) {
          if (append && results) {
            setResults({
              ...resData.data,
              media: [...results.media, ...resData.data.media],
            });
          } else {
            setResults(resData.data);
          }
        }
      } catch {
        // Handle error
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [params.slug, query, selectedYear, mediaType, results]
  );

  // Debounced search when query/filters change
  useEffect(() => {
    const handler = setTimeout(() => {
      performSearch();
    }, 300);
    return () => clearTimeout(handler);
  }, [query, selectedYear, mediaType]);

  const handleLoadMore = () => {
    if (results?.pagination.nextCursor && !loadingMore) {
      performSearch(results.pagination.nextCursor, true);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            DISCOVERY ENGINE
          </span>
          <span className="text-xs text-slate-500">PostgreSQL Indexed Search</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Organisation Media & Event Search
        </h1>
        <p className="text-sm text-slate-400">
          Find photos, videos, events, and albums across the entire organisation archive.
        </p>
      </div>

      {/* Main Search Input & Year Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by event title, album name, or photo/video filename..."
            className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition shadow-xl"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Year Pills */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
              Year:
            </span>
            <button
              onClick={() => setSelectedYear(undefined)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                selectedYear === undefined
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All Years
            </button>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  selectedYear === y
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Media Type Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800/80">
            <button
              onClick={() => setMediaType('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                mediaType === 'ALL'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setMediaType('IMAGE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                mediaType === 'IMAGE'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Photos
            </button>
            <button
              onClick={() => setMediaType('VIDEO')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                mediaType === 'VIDEO'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Videos
            </button>
          </div>
        </div>
      </div>

      {/* Results Content */}
      {loading && !results ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-10">
          {/* Matching Events Section */}
          {results?.events && results.events.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Matching Events ({results.events.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.events.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/organisations/${params.slug}/events/${ev.id}/media`}
                    className="group p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/60 transition shadow-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white group-hover:text-cyan-400 transition truncate">
                        {ev.name}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition" />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{new Date(ev.eventDate).toLocaleDateString()}</span>
                      {ev.location && <span>• {ev.location}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Matching Albums Section */}
          {results?.albums && results.albums.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>Matching Albums ({results.albums.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.albums.map((alb) => (
                  <Link
                    key={alb.id}
                    href={`/organisations/${params.slug}/events/${alb.event.id}/albums/${alb.id}`}
                    className="group p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/60 transition shadow-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white group-hover:text-indigo-400 transition truncate">
                        {alb.name}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition" />
                    </div>
                    <p className="text-xs text-slate-400">Event: {alb.event.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Matching Photos and Videos Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Matching Media ({results?.media.length || 0})</span>
            </h2>

            <GalleryGrid
              items={results?.media || []}
              organisationSlug={params.slug}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={Boolean(results?.pagination.hasMore)}
              onLoadMore={handleLoadMore}
            />
          </div>
        </div>
      )}
    </div>
  );
}
