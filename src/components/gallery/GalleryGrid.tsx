'use client';

import React, { useState } from 'react';
import MediaCard, { GalleryMediaItem } from './MediaCard';
import Lightbox from './Lightbox';
import { Layers, FolderOpen, ArrowDown, RefreshCw } from 'lucide-react';

interface GalleryGridProps {
  items: GalleryMediaItem[];
  organisationSlug: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onClearFilters?: () => void;
  allowDownloads?: boolean;
}

export default function GalleryGrid({
  items,
  organisationSlug,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onClearFilters,
  allowDownloads = true,
}: GalleryGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleSelect = (item: GalleryMediaItem) => {
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      setSelectedIndex(idx);
    }
  };

  return (
    <div className="space-y-8">
      {/* Initial Loading Skeleton */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl bg-slate-900/80 border border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <>
          {/* Fluid Responsive Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                organisationSlug={organisationSlug}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Keyset Cursor Pagination / Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-2xl font-semibold text-xs text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/60 transition shadow-xl flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Loading more media...</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-4 h-4 text-cyan-400" />
                    <span>Load More Media</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        /* Empty State */
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-4 shadow-xl">
          <FolderOpen className="w-12 h-12 mx-auto text-slate-700" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No media found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No photos or videos match your current filter and search criteria.
            </p>
          </div>
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedIndex !== null && (
        <Lightbox
          items={items}
          selectedIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          onNavigate={(newIdx) => setSelectedIndex(newIdx)}
          allowDownloads={allowDownloads}
        />
      )}
    </div>
  );
}
