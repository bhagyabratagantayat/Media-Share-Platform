'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Settings,
  Shield,
  KeyRound,
  Users,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface MemberItem {
  id: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
}

export default function OrganisationSettingsPage() {
  const params = useParams<{ slug: string }>();
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'ACCESS' | 'MEMBERS'>('GENERAL');
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // General Form State
  const [generalForm, setGeneralForm] = useState({
    name: '',
    description: '',
    officialEmail: '',
    contactPhone: '',
    country: '',
    state: '',
    city: '',
    website: '',
    privacy: 'DISCOVERABLE',
  });

  // Password Rotation Form State
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
    invalidateSessions: true,
  });

  const loadData = async () => {
    if (!params.slug) return;
    setLoading(true);
    setError(null);

    try {
      const [orgRes, membersRes] = await Promise.all([
        fetch(`/api/organisations/${params.slug}`),
        fetch(`/api/organisations/${params.slug}/members`),
      ]);

      const orgData = await orgRes.json();
      const membersData = await membersRes.json();

      if (orgRes.ok && orgData.success) {
        setOrg(orgData.data);
        setGeneralForm({
          name: orgData.data.name || '',
          description: orgData.data.description || '',
          officialEmail: orgData.data.officialEmail || '',
          contactPhone: orgData.data.contactPhone || '',
          country: orgData.data.country || '',
          state: orgData.data.state || '',
          city: orgData.data.city || '',
          website: orgData.data.website || '',
          privacy: orgData.data.privacy || 'DISCOVERABLE',
        });
      } else {
        setError(orgData.error?.message || 'Failed to load organisation.');
      }

      if (membersRes.ok && membersData.success) {
        setMembers(membersData.data);
      }
    } catch {
      setError('An unexpected error occurred while loading settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [params.slug]);

  const handleGeneralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generalForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to update settings.');
        return;
      }

      setSuccessMsg('Organisation settings updated successfully.');
      loadData();
    } catch {
      setError('Failed to update settings.');
    }
  };

  const handlePasswordRotateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('Access password must be at least 6 characters long.');
      return;
    }

    try {
      const res = await fetch(`/api/organisations/${params.slug}/access-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: passwordForm.newPassword,
          invalidateSessions: passwordForm.invalidateSessions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to rotate access password.');
        return;
      }

      setSuccessMsg('Organisation access password rotated successfully!');
      setPasswordForm({ newPassword: '', confirmPassword: '', invalidateSessions: true });
      loadData();
    } catch {
      setError('Failed to rotate access password.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <Link
        href={`/organisations/${params.slug}/dashboard`}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Dashboard
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Organisation Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage profile, access security, and member roles for {org?.name}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('GENERAL')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'GENERAL'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          General Information
        </button>
        <button
          onClick={() => setActiveTab('ACCESS')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'ACCESS'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Access & Password Security
        </button>
        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'MEMBERS'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Members ({members.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'GENERAL' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
          <form onSubmit={handleGeneralSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Organisation Name</label>
                <input
                  type="text"
                  required
                  value={generalForm.name}
                  onChange={(e) => setGeneralForm({ ...generalForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  value={generalForm.officialEmail}
                  onChange={(e) => setGeneralForm({ ...generalForm, officialEmail: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
              <textarea
                rows={3}
                value={generalForm.description}
                onChange={(e) => setGeneralForm({ ...generalForm, description: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">City</label>
                <input
                  type="text"
                  value={generalForm.city}
                  onChange={(e) => setGeneralForm({ ...generalForm, city: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">State</label>
                <input
                  type="text"
                  value={generalForm.state}
                  onChange={(e) => setGeneralForm({ ...generalForm, state: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Country</label>
                <input
                  type="text"
                  value={generalForm.country}
                  onChange={(e) => setGeneralForm({ ...generalForm, country: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Website URL</label>
                <input
                  type="url"
                  value={generalForm.website}
                  onChange={(e) => setGeneralForm({ ...generalForm, website: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Privacy Mode</label>
                <select
                  value={generalForm.privacy}
                  onChange={(e) => setGeneralForm({ ...generalForm, privacy: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="DISCOVERABLE">Discoverable</option>
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="py-2.5 px-6 rounded-xl font-semibold text-xs text-white bg-cyan-600 hover:bg-cyan-500 transition-colors shadow-md"
              >
                Save General Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'ACCESS' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs text-slate-400 block">Current Gate State</span>
              <span className="font-bold text-sm text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-4 h-4" /> Active Password Gate (Version {org?.accessSettings?.accessVersion || 1})
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">Argon2id Encrypted</span>
          </div>

          <form onSubmit={handlePasswordRotateSubmit} className="space-y-4">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Rotate Access Password
            </h3>
            <p className="text-xs text-slate-400">
              Set a new shared password for this organisation. Enabling session invalidation will immediately lock out
              prior guest pass holders until they enter the new password.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Access Password</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Repeat new password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="invalidateSessions"
                checked={passwordForm.invalidateSessions}
                onChange={(e) => setPasswordForm({ ...passwordForm, invalidateSessions: e.target.checked })}
                className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
              />
              <label htmlFor="invalidateSessions" className="text-xs text-slate-300 cursor-pointer">
                Immediately invalidate existing organisation access sessions (Increments Access Version)
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="py-2.5 px-6 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 transition-colors shadow-md flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Rotate Password Now
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'MEMBERS' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
          <div className="divide-y divide-slate-800">
            {members.map((member) => (
              <div key={member.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white">
                    {member.user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-white block">{member.user.name}</span>
                    <span className="text-xs text-slate-400">{member.user.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-cyan-400 border border-slate-700">
                    {member.role.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Joined {new Date(member.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
