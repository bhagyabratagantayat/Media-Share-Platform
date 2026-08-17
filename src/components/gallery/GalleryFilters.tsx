'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, SlidersHorizontal, X, FileImage, FileVideo, Layers } from 'lucide-react';

export interface GalleryFilterState {
  mediaType: 'ALL' | 'IMAGE' | 'VIDEO';
  search: string;
  albumId?: string;
  sort: 'newest' | 'oldest';
  startDate?: string;
  endDate?: string;
}

interface GalleryFiltersProps {
  filters: GalleryFilterState;
  onChange: (newFilters: GalleryFilterState) => void;
  albums?: Array<{ id: string; name: string; mediaCount?: number }>;
  showAlbumPicker?: boolean;
}

export default function GalleryFilters({
  filters,
  onChange,
  albums = [],
  showAlbumPicker = true,
}: GalleryFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 300ms Debounce on Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInput, filters, onChange]);

  const hasActiveFilters =
    filters.mediaType !== 'ALL' ||
    filters.search.length > 0 ||
    Boolean(filters.albumId) ||
    filters.sort !== 'newest' ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  const handleClear = () => {
    setSearchInput('');
    onChange({
      mediaType: 'ALL',
      search: '',
      albumId: undefined,
      sort: 'newest',
      startDate: undefined,
      endDate: undefined,
    });
  };

  return (
    <div className="space-y-3">
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
        {/* Media Type Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800/80">
          <button
            onClick={() => onChange({ ...filters, mediaType: 'ALL' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              filters.mediaType === 'ALL'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All</span>
          </button>

          <button
            onClick={() => onChange({ ...filters, mediaType: 'IMAGE' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              filters.mediaType === 'IMAGE'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>Photos</span>
          </button>

          <button
            onClick={() => onChange({ ...filters, mediaType: 'VIDEO' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              filters.mediaType === 'VIDEO'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileVideo className="w-3.5 h-3.5" />
            <span>Videos</span>
          </button>
        </div>

        {/* Search Input with Debounce */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by filename or title..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Album Selector & Sort Controls */}
        <div className="flex items-center gap-2">
          {showAlbumPicker && albums.length > 0 && (
            <select
              value={filters.albumId || ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  albumId: e.target.value ? e.target.value : undefined,
                })
              }
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Albums</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.mediaCount !== undefined ? `(${a.mediaCount})` : ''}
                </option>
              ))}
            </select>
          )}

          <select
            value={filters.sort}
            onChange={(e) =>
              onChange({ ...filters, sort: e.target.value as 'newest' | 'oldest' })
            }
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-2 rounded-xl text-xs font-semibold transition border ${
              showAdvanced
                ? 'bg-cyan-950 text-cyan-400 border-cyan-800'
                : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
            }`}
            title="Date Filter"
          >
            <Calendar className="w-4 h-4" />
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleClear}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/30 transition flex items-center gap-1"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Date Range Dropdown */}
      {showAdvanced && (
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 backdrop-blur-xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs animate-in fade-in slide-in-from-top-2">
          <div>
            <label className="block font-semibold text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) =>
                onChange({ ...filters, startDate: e.target.value || undefined })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) =>
                onChange({ ...filters, endDate: e.target.value || undefined })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
