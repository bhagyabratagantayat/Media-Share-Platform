'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  SlidersHorizontal,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Info,
  Layers,
  FileImage,
  FileVideo,
  Clock,
} from 'lucide-react';

interface SettingsForm {
  allowUserUploads: boolean;
  requireUserUploadApproval: boolean;
  allowUserVideoUploads: boolean;
  allowUserPhotoUploads: boolean;
  autoPublishUserUploads: boolean;
  autoPublishOfficialMedia: boolean;
  maxUserFilesPerBatch: number;
  maxUserImageSizeMB: number;
  maxUserVideoSizeMB: number;
  maxUserUploadsPerDay: number;
}

export default function OrganisationUploadSettingsPage() {
  const params = useParams<{ slug: string }>();

  const [form, setForm] = useState<SettingsForm>({
    allowUserUploads: true,
    requireUserUploadApproval: true,
    allowUserVideoUploads: true,
    allowUserPhotoUploads: true,
    autoPublishUserUploads: true,
    autoPublishOfficialMedia: true,
    maxUserFilesPerBatch: 20,
    maxUserImageSizeMB: 25,
    maxUserVideoSizeMB: 200,
    maxUserUploadsPerDay: 50,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!params.slug) return;
    setLoading(true);

    fetch(`/api/organisations/${params.slug}/upload-settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const d = data.data;
          setForm({
            allowUserUploads: d.allowUserUploads ?? true,
            requireUserUploadApproval: d.requireUserUploadApproval ?? true,
            allowUserVideoUploads: d.allowUserVideoUploads ?? true,
            allowUserPhotoUploads: d.allowUserPhotoUploads ?? true,
            autoPublishUserUploads: d.autoPublishUserUploads ?? true,
            autoPublishOfficialMedia: d.autoPublishOfficialMedia ?? true,
            maxUserFilesPerBatch: d.maxUserFilesPerBatch ?? 20,
            maxUserImageSizeMB: Math.round((d.maxUserImageSize || 26214400) / (1024 * 1024)),
            maxUserVideoSizeMB: Math.round((d.maxUserVideoSize || 209715200) / (1024 * 1024)),
            maxUserUploadsPerDay: d.maxUserUploadsPerDay ?? 50,
          });
        }
      })
      .catch(() => setErrorMessage('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, [params.slug]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/upload-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowUserUploads: form.allowUserUploads,
          requireUserUploadApproval: form.requireUserUploadApproval,
          allowUserVideoUploads: form.allowUserVideoUploads,
          allowUserPhotoUploads: form.allowUserPhotoUploads,
          autoPublishUserUploads: form.autoPublishUserUploads,
          autoPublishOfficialMedia: form.autoPublishOfficialMedia,
          maxUserFilesPerBatch: form.maxUserFilesPerBatch,
          maxUserImageSize: form.maxUserImageSizeMB * 1024 * 1024,
          maxUserVideoSize: form.maxUserVideoSizeMB * 1024 * 1024,
          maxUserUploadsPerDay: form.maxUserUploadsPerDay,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMessage('Upload & Moderation policies successfully updated.');
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(data.error?.message || 'Failed to update settings.');
      }
    } catch {
      setErrorMessage('Network error while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/organisations/${params.slug}/moderation`}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Moderation
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Community Upload & Policy Settings
          </h1>
          <p className="text-sm text-slate-400">
            Configure permissions, moderation requirements, and file limits for community submissions.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800 text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Submission Policy */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            1. Core Submission & Moderation
          </h2>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white">Allow Community Submissions</span>
                <p className="text-xs text-slate-400">Enable non-staff members to upload photos and videos to events.</p>
              </div>
              <input
                type="checkbox"
                checked={form.allowUserUploads}
                onChange={(e) => setForm({ ...form, allowUserUploads: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white">Require Admin Moderation Review</span>
                <p className="text-xs text-slate-400">Hold community uploads in PENDING review before displaying in event gallery.</p>
              </div>
              <input
                type="checkbox"
                checked={form.requireUserUploadApproval}
                onChange={(e) => setForm({ ...form, requireUserUploadApproval: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white">Auto-Publish Approved Submissions</span>
                <p className="text-xs text-slate-400">Automatically make media visible in public gallery once approved.</p>
              </div>
              <input
                type="checkbox"
                checked={form.autoPublishUserUploads}
                onChange={(e) => setForm({ ...form, autoPublishUserUploads: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
              />
            </label>
          </div>
        </div>

        {/* Media Type Restrictions */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            2. Allowed Formats & Features
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <div className="flex items-center gap-3">
                <FileImage className="w-5 h-5 text-cyan-400" />
                <div>
                  <span className="text-xs font-bold text-white">Allow Photos</span>
                  <p className="text-[11px] text-slate-400">JPEG, PNG, WebP, HEIC</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.allowUserPhotoUploads}
                onChange={(e) => setForm({ ...form, allowUserPhotoUploads: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <div className="flex items-center gap-3">
                <FileVideo className="w-5 h-5 text-indigo-400" />
                <div>
                  <span className="text-xs font-bold text-white">Allow Videos</span>
                  <p className="text-[11px] text-slate-400">MP4, MOV, WebM</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.allowUserVideoUploads}
                onChange={(e) => setForm({ ...form, allowUserVideoUploads: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
              />
            </label>
          </div>
        </div>

        {/* Limits & Rate Constraints */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            3. Limits & Quotas
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Max Files Per Batch Submission
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={form.maxUserFilesPerBatch}
                onChange={(e) => setForm({ ...form, maxUserFilesPerBatch: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Daily Upload Limit Per User
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={form.maxUserUploadsPerDay}
                onChange={(e) => setForm({ ...form, maxUserUploadsPerDay: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Max Photo Size (MB)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.maxUserImageSizeMB}
                onChange={(e) => setForm({ ...form, maxUserImageSizeMB: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Max Video Size (MB)
              </label>
              <input
                type="number"
                min={5}
                max={1000}
                value={form.maxUserVideoSizeMB}
                onChange={(e) => setForm({ ...form, maxUserVideoSizeMB: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/organisations/${params.slug}/moderation`}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
