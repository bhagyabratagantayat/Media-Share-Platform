'use client';

import React, { useState } from 'react';
import { Play, FileImage, FileVideo, Eye } from 'lucide-react';

export interface GalleryMediaItem {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO';
  status: string;
  originalFileName: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  isPublished: boolean;
  approvalStatus: string;
  createdAt: string;
  event?: { id: string; name: string; slug: string };
  album?: { id: string; name: string; slug: string } | null;
  variants?: Array<{
    id: string;
    variantType: string;
    storageKey: string;
    width?: number | null;
    height?: number | null;
  }>;
}

interface MediaCardProps {
  item: GalleryMediaItem;
  organisationSlug: string;
  onSelect: (item: GalleryMediaItem) => void;
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export default function MediaCard({ item, organisationSlug, onSelect }: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Thumbnail delivery URL via Phase 6 signed media delivery
  const thumbnailUrl = `/api/media/${item.id}/access?variant=THUMBNAIL`;

  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative aspect-square rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-cyan-500/60 overflow-hidden cursor-pointer transition-all duration-300 shadow-md hover:shadow-cyan-500/10 hover:-translate-y-0.5 select-none"
    >
      {/* Loading Skeleton */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-slate-900 animate-pulse flex items-center justify-center text-slate-700">
          {item.mediaType === 'VIDEO' ? (
            <FileVideo className="w-8 h-8 opacity-40" />
          ) : (
            <FileImage className="w-8 h-8 opacity-40" />
          )}
        </div>
      )}

      {/* Image / Thumbnail */}
      {!imageError ? (
        <img
          src={thumbnailUrl}
          alt={item.originalFileName}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-950 text-slate-600 space-y-1">
          {item.mediaType === 'VIDEO' ? (
            <FileVideo className="w-8 h-8 text-indigo-500/60" />
          ) : (
            <FileImage className="w-8 h-8 text-cyan-500/60" />
          )}
          <span className="text-[10px] text-slate-500 truncate w-full px-2">
            {item.originalFileName}
          </span>
        </div>
      )}

      {/* Video Indicator & Duration Badge */}
      {item.mediaType === 'VIDEO' && (
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-lg">
          <Play className="w-2.5 h-2.5 fill-white text-white" />
          <span>{formatDuration(item.durationMs)}</span>
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
        <p className="text-xs font-semibold text-white truncate drop-shadow-md">
          {item.originalFileName}
        </p>
        <div className="flex items-center justify-between text-[10px] text-slate-300 mt-0.5">
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          {item.album && <span className="truncate max-w-[120px]">{item.album.name}</span>}
        </div>
      </div>
    </div>
  );
}
