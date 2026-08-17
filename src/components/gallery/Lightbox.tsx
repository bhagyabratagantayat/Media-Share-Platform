'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Calendar,
  Layers,
  FileImage,
  FileVideo,
  Maximize2,
} from 'lucide-react';
import { GalleryMediaItem } from './MediaCard';

interface LightboxProps {
  items: GalleryMediaItem[];
  selectedIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  allowDownloads?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function Lightbox({
  items,
  selectedIndex,
  onClose,
  onNavigate,
  allowDownloads = true,
}: LightboxProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const currentItem = items[selectedIndex];
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      setLoadingMedia(true);
      onNavigate(selectedIndex - 1);
    }
  }, [hasPrev, selectedIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      setLoadingMedia(true);
      onNavigate(selectedIndex + 1);
    }
  }, [hasNext, selectedIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  // Reset loading media on index change
  useEffect(() => {
    setLoadingMedia(true);
  }, [selectedIndex]);

  if (!currentItem) return null;

  const previewUrl = `/api/media/${currentItem.id}/access?variant=PREVIEW_OPTIMIZED`;
  const posterUrl = `/api/media/${currentItem.id}/access?variant=POSTER`;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(`/api/media/${currentItem.id}/access?isDownload=true`);
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.open(data.data.url, '_blank');
      } else {
        alert('Failed to obtain authorized download link.');
      }
    } catch {
      alert('Error initiating download.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none animate-in fade-in duration-200">
      {/* Top Action Bar */}
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/60 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold text-slate-400">
            {selectedIndex + 1} / {items.length}
          </span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-md">
            {currentItem.originalFileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-xl text-xs font-semibold transition ${
              showInfo
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800'
            }`}
            title="Toggle Details"
          >
            <Info className="w-4 h-4" />
          </button>

          {allowDownloads && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="p-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition"
              title="Download Media"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Media Canvas Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden">
        {/* Previous Button */}
        {hasPrev && (
          <button
            onClick={handlePrev}
            className="absolute left-4 z-20 p-3 rounded-2xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-white transition hover:scale-105 shadow-xl"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Media Element */}
        <div className="max-w-full max-h-full flex items-center justify-center">
          {loadingMedia && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {currentItem.mediaType === 'VIDEO' ? (
            <video
              key={currentItem.id}
              src={previewUrl}
              poster={posterUrl}
              controls
              autoPlay
              playsInline
              onLoadedData={() => setLoadingMedia(false)}
              className="max-w-full max-h-[82vh] rounded-2xl shadow-2xl object-contain"
            />
          ) : (
            <img
              key={currentItem.id}
              src={previewUrl}
              alt={currentItem.originalFileName}
              onLoad={() => setLoadingMedia(false)}
              className="max-w-full max-h-[82vh] rounded-2xl shadow-2xl object-contain"
            />
          )}
        </div>

        {/* Next Button */}
        {hasNext && (
          <button
            onClick={handleNext}
            className="absolute right-4 z-20 p-3 rounded-2xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-white transition hover:scale-105 shadow-xl"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Info Drawer */}
        {showInfo && (
          <div className="absolute right-4 bottom-4 top-4 w-80 bg-slate-900/95 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl z-30 overflow-y-auto space-y-5 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>Media Information</span>
              </h3>
              <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">File Name</span>
                <p className="font-semibold text-white break-all">{currentItem.originalFileName}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">Event Context</span>
                <p className="font-semibold text-white">{currentItem.event?.name || 'Event'}</p>
                {currentItem.album && (
                  <p className="text-slate-400">Album: {currentItem.album.name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Dimensions</span>
                  <p className="font-semibold text-white">
                    {currentItem.width && currentItem.height
                      ? `${currentItem.width} × ${currentItem.height}`
                      : 'Optimized'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">File Size</span>
                  <p className="font-semibold text-white">{formatBytes(currentItem.fileSize)}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">Uploaded On</span>
                <p className="font-semibold text-white">
                  {new Date(currentItem.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
