'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Shield,
  Settings,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Layers,
  Users,
  Image as ImageIcon,
  Clock,
  Mail,
  Globe,
  Save,
  Lock,
} from 'lucide-react';

interface FaceStats {
  faceDiscoveryEnabled: boolean;
  eligibleEventsCount: number;
  totalIndexedFaces: number;
  totalIndexedMedia: number;
  activeUserProfilesCount: number;
  pendingJobsCount: number;
  failedJobsCount: number;
}

interface OrgSettingsForm {
  faceDiscoveryEnabled: boolean;
  allowFaceDiscoveryForMinors: boolean;
  faceProfileRetentionDays: number;
  temporaryFaceDataRetentionMinutes: number;
  facePrivacyPolicyUrl: string;
  facePrivacyContactEmail: string;
  faceConsentVersion: string;
}

export default function FaceDiscoveryAdminSettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<FaceStats | null>(null);
  const [form, setForm] = useState<OrgSettingsForm>({
    faceDiscoveryEnabled: false,
    allowFaceDiscoveryForMinors: false,
    faceProfileRetentionDays: 365,
    temporaryFaceDataRetentionMinutes: 60,
    facePrivacyPolicyUrl: '',
    facePrivacyContactEmail: '',
    faceConsentVersion: 'v1',
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, orgRes] = await Promise.all([
        fetch(`/api/organisations/${slug}/face-discovery/admin/stats`),
        fetch(`/api/organisations/${slug}`),
      ]);

      const statsData = await statsRes.json();
      const orgData = await orgRes.json();

      if (!statsData.success) {
        throw new Error(statsData.error?.message || 'Failed to load face discovery statistics');
      }

      setStats(statsData.data);

      if (orgData.success && orgData.data) {
        const o = orgData.data;
        setForm({
          faceDiscoveryEnabled: !!o.faceDiscoveryEnabled,
          allowFaceDiscoveryForMinors: !!o.allowFaceDiscoveryForMinors,
          faceProfileRetentionDays: o.faceProfileRetentionDays || 365,
          temporaryFaceDataRetentionMinutes: o.temporaryFaceDataRetentionMinutes || 60,
          facePrivacyPolicyUrl: o.facePrivacyPolicyUrl || '',
          facePrivacyContactEmail: o.facePrivacyContactEmail || '',
          faceConsentVersion: o.faceConsentVersion || 'v1',
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      loadData();
    }
  }, [slug]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/organisations/${slug}/face-discovery/admin/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to save settings');
      }

      setSuccessMsg('Face discovery settings updated successfully.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading admin biometric policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/organisations/${slug}/settings`}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h1 className="text-lg font-bold text-white tracking-wide">Biometric & Face Discovery Admin</h1>
              </div>
              <p className="text-xs text-slate-400">Manage organisation-level privacy policies and retention</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                form.faceDiscoveryEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  form.faceDiscoveryEnabled ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {form.faceDiscoveryEnabled ? 'Feature Enabled' : 'Feature Disabled'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-3 text-red-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-start gap-3 text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>Eligible Events</span>
            </div>
            <p className="text-xl font-bold text-white">{stats?.eligibleEventsCount || 0}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Indexed Faces</span>
            </div>
            <p className="text-xl font-bold text-indigo-400">{stats?.totalIndexedFaces || 0}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span>Active Profiles</span>
            </div>
            <p className="text-xl font-bold text-emerald-400">{stats?.activeUserProfilesCount || 0}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Clock className="w-3.5 h-3.5" />
              <span>Queue Status</span>
            </div>
            <p className="text-xs font-semibold text-slate-200 mt-1">
              {stats?.pendingJobsCount ? `${stats.pendingJobsCount} Pending` : 'Idle / Up to Date'}
            </p>
          </div>
        </div>

        {/* Settings Form */}
        <form onSubmit={handleSave} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Feature Toggles & Legal Safeguards</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure organisation-level face discovery availability and compliance parameters.
            </p>
          </div>

          {/* Master Toggle */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <label className="font-semibold text-sm text-white block">Enable Face Discovery for Organisation</label>
              <p className="text-xs text-slate-400 mt-0.5">
                When enabled, authorised organisation members can opt-in to face discovery and search approved event media.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.faceDiscoveryEnabled}
              onChange={(e) => setForm({ ...form, faceDiscoveryEnabled: e.target.checked })}
              className="mt-1 w-5 h-5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          {/* Minor Policy Toggle */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <label className="font-semibold text-sm text-white block">Allow Face Discovery for Minor Accounts</label>
              <p className="text-xs text-slate-400 mt-0.5">
                Restricts biometric enrollment for accounts designated as minors unless explicit parental consent workflow is verified.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.allowFaceDiscoveryForMinors}
              onChange={(e) => setForm({ ...form, allowFaceDiscoveryForMinors: e.target.checked })}
              className="mt-1 w-5 h-5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          {/* Retention Windows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Face Profile Retention Window (Days)
              </label>
              <input
                type="number"
                min={30}
                max={730}
                value={form.faceProfileRetentionDays}
                onChange={(e) => setForm({ ...form, faceProfileRetentionDays: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                User face profiles older than this will be automatically expired and purged (Default: 365 days).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Temporary Data Retention (Minutes)
              </label>
              <input
                type="number"
                min={15}
                max={1440}
                value={form.temporaryFaceDataRetentionMinutes}
                onChange={(e) => setForm({ ...form, temporaryFaceDataRetentionMinutes: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                Temporary selfie files and upload staging objects are deleted after this window (Default: 60 min).
              </p>
            </div>
          </div>

          {/* Privacy Disclosures & Contact */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Privacy Disclosures & Transparency
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block">Privacy Policy URL</label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    placeholder="https://example.edu/privacy/biometrics"
                    value={form.facePrivacyPolicyUrl}
                    onChange={(e) => setForm({ ...form, facePrivacyPolicyUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block">Privacy / DPO Contact Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    placeholder="privacy@example.edu"
                    value={form.facePrivacyContactEmail}
                    onChange={(e) => setForm({ ...form, facePrivacyContactEmail: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 block">Active Consent Version Tag</label>
              <input
                type="text"
                value={form.faceConsentVersion}
                onChange={(e) => setForm({ ...form, faceConsentVersion: e.target.value })}
                className="w-full max-w-xs bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                Updating this tag (e.g. from v1 to v2) will require all users to re-consent before performing new searches.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Face Discovery Settings</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
