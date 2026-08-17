'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
  UserPlus,
  Trash2,
  AlertTriangle,
  Flame,
  Archive,
  Power,
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'ACCESS' | 'MEMBERS' | 'DANGER'>('GENERAL');
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    allowOriginalDownloads: false,
    allowVideoDownloads: true,
    allowPhotoDownloads: true,
    allowBulkDownloads: true,
  });

  // Password Rotation Form State
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
    invalidateSessions: true,
  });

  // Member Invite Form State
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'USER',
  });

  // Transfer Ownership State
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showRevokeSessionsModal, setShowRevokeSessionsModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

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
          allowOriginalDownloads: orgData.data.allowOriginalDownloads ?? false,
          allowVideoDownloads: orgData.data.allowVideoDownloads ?? true,
          allowPhotoDownloads: orgData.data.allowPhotoDownloads ?? true,
          allowBulkDownloads: orgData.data.allowBulkDownloads ?? true,
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
    setSubmitting(true);

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
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePasswordGate = async (enabled: boolean) => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/access-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to toggle access password gate.');
        return;
      }

      setSuccessMsg(`Access password gate ${enabled ? 'enabled' : 'disabled'} successfully.`);
      loadData();
    } catch {
      setError('Failed to toggle access password.');
    } finally {
      setSubmitting(false);
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

    setSubmitting(true);

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
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/access/revoke-all`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to revoke access sessions.');
        return;
      }

      setSuccessMsg('All active organisation access sessions have been revoked.');
      setShowRevokeSessionsModal(false);
      loadData();
    } catch {
      setError('Failed to revoke sessions.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to add member.');
        return;
      }

      setSuccessMsg(`Member ${inviteForm.email} added successfully.`);
      setInviteForm({ email: '', role: 'USER' });
      loadData();
    } catch {
      setError('Failed to invite member.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeMemberRole = async (memberId: string, newRole: string) => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to update member role.');
        return;
      }

      setSuccessMsg('Member role updated successfully.');
      loadData();
    } catch {
      setError('Failed to update member role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member from the organisation?')) {
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/members/${memberId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to remove member.');
        return;
      }

      setSuccessMsg('Member removed successfully.');
      loadData();
    } catch {
      setError('Failed to remove member.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTargetUserId) {
      setError('Please select a target member to transfer ownership.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/owner-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: transferTargetUserId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to transfer ownership.');
        return;
      }

      setSuccessMsg('Organisation ownership successfully transferred.');
      setShowTransferModal(false);
      loadData();
    } catch {
      setError('Failed to transfer ownership.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveOrganisation = async () => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to archive organisation.');
        return;
      }

      setSuccessMsg('Organisation has been archived.');
      setShowArchiveModal(false);
      loadData();
    } catch {
      setError('Failed to update organisation status.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPasswordEnabled = org?.accessSettings?.enabled ?? true;

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
      <div className="flex border-b border-slate-800 mb-6 gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('GENERAL')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'GENERAL'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          General Information
        </button>
        <button
          onClick={() => setActiveTab('ACCESS')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'ACCESS'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Access & Password Security
        </button>
        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'MEMBERS'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Members ({members.length})
        </button>
        <Link
          href={`/organisations/${params.slug}/settings/face-discovery`}
          className="pb-3 px-4 text-xs font-semibold border-b-2 border-transparent text-indigo-400 hover:text-indigo-300 transition-all whitespace-nowrap flex items-center gap-1.5"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Biometric Privacy & Face Discovery</span>
        </Link>
        <button
          onClick={() => setActiveTab('DANGER')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'DANGER'
              ? 'border-red-500 text-red-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Danger Zone
        </button>
      </div>

      {/* Tab Content: General */}
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
                  <option value="DISCOVERABLE">Discoverable (Listed in Directory)</option>
                  <option value="PUBLIC">Public (Openly Accessible)</option>
                  <option value="PRIVATE">Private (Restricted to Invited Members)</option>
                </select>
              </div>
            </div>

            {/* Media Download Policies */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Download &amp; Export Policies
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={generalForm.allowPhotoDownloads}
                    onChange={(e) => setGeneralForm({ ...generalForm, allowPhotoDownloads: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Allow Photo Downloads</span>
                    <span className="text-[11px] text-slate-400">Permit guests and members to download photos.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={generalForm.allowVideoDownloads}
                    onChange={(e) => setGeneralForm({ ...generalForm, allowVideoDownloads: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Allow Video Downloads</span>
                    <span className="text-[11px] text-slate-400">Permit guests and members to download videos.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={generalForm.allowBulkDownloads}
                    onChange={(e) => setGeneralForm({ ...generalForm, allowBulkDownloads: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Allow Bulk ZIP Exports</span>
                    <span className="text-[11px] text-slate-400">Permit multi-file, album, and full-event ZIP downloads.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={generalForm.allowOriginalDownloads}
                    onChange={(e) => setGeneralForm({ ...generalForm, allowOriginalDownloads: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">Allow Original Master Downloads</span>
                    <span className="text-[11px] text-slate-400">Permit non-staff users to download raw camera masters.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="py-2.5 px-6 rounded-xl font-semibold text-xs text-white bg-cyan-600 hover:bg-cyan-500 transition-colors shadow-md disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save General Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab Content: Access & Security */}
      {activeTab === 'ACCESS' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl space-y-8">
          {/* Gate Toggle Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800 gap-4">
            <div>
              <span className="text-xs text-slate-400 block">Access Password Gate</span>
              <span className={`font-bold text-sm flex items-center gap-1.5 mt-0.5 ${isPasswordEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-4 h-4" />
                {isPasswordEnabled ? `Enabled (Active Version ${org?.accessSettings?.accessVersion || 1})` : 'Disabled (Open to Members)'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                {isPasswordEnabled
                  ? 'Guests and users must enter the access password to unlock organisation galleries.'
                  : 'Organisation is currently accessible directly by active members without passcode challenge.'}
              </p>
            </div>
            <button
              onClick={() => handleTogglePasswordGate(!isPasswordEnabled)}
              disabled={submitting}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 flex items-center gap-2 ${
                isPasswordEnabled
                  ? 'bg-red-950/60 text-red-400 border border-red-800 hover:bg-red-900/80'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/80'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {isPasswordEnabled ? 'Disable Gate' : 'Enable Gate'}
            </button>
          </div>

          {/* Password Change Form */}
          <form onSubmit={handlePasswordRotateSubmit} className="space-y-4 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> Change / Rotate Access Password
            </h3>
            <p className="text-xs text-slate-400">
              Set a new shared passcode for this organisation. Enabling session invalidation will immediately lock out
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

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="py-2.5 px-6 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 transition-colors shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {submitting ? 'Updating...' : 'Rotate Password Now'}
              </button>
            </div>
          </form>

          {/* Revoke Sessions Card */}
          <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-200">Revoke All Active Passes</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Force all current guests and users with cached pass sessions to re-authenticate with the access passcode.
              </p>
            </div>
            <button
              onClick={() => setShowRevokeSessionsModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-800/60 hover:bg-amber-900/60 transition-colors shrink-0"
            >
              Revoke All Sessions
            </button>
          </div>
        </div>
      )}

      {/* Tab Content: Members */}
      {activeTab === 'MEMBERS' && (
        <div className="space-y-6">
          {/* Invite Member Form */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> Invite / Add Member
            </h3>
            <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="Member email address..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="sm:col-span-3">
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="USER">User (Standard)</option>
                  <option value="SOCIAL_MEDIA_MEMBER">Social Media Member</option>
                  <option value="SOCIAL_MEDIA_MANAGER">Social Media Manager</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="ORGANISATION_ADMIN">Organisation Admin</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors disabled:opacity-50"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>

          {/* Members List */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
            <div className="divide-y divide-slate-800">
              {members.map((member) => {
                const isOwner = member.role === 'ORGANISATION_OWNER';
                return (
                  <div key={member.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white">
                        {member.user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{member.user.name}</span>
                          {isOwner && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60">
                              Owner
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{member.user.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!isOwner ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleChangeMemberRole(member.id, e.target.value)}
                          disabled={submitting}
                          aria-label={`Role for ${member.user.name}`}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-950 border border-slate-800 text-cyan-300 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="USER">User</option>
                          <option value="SOCIAL_MEDIA_MEMBER">Social Media Member</option>
                          <option value="SOCIAL_MEDIA_MANAGER">Social Media Manager</option>
                          <option value="MODERATOR">Moderator</option>
                          <option value="ORGANISATION_ADMIN">Organisation Admin</option>
                        </select>
                      ) : (
                        <span className="px-3 py-1 text-xs font-semibold text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
                          Primary Owner
                        </span>
                      )}

                      {!isOwner && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={submitting}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Danger Zone */}
      {activeTab === 'DANGER' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-red-950/20 border border-red-900/40 backdrop-blur-xl space-y-6">
          <div>
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4" /> Organisation Critical Actions
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Be careful with these operations. Transferring ownership or archiving cannot be easily reversed.
            </p>
          </div>

          {/* Transfer Ownership */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-950/80 border border-red-900/30 gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-200">Transfer Organisation Ownership</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign primary ownership to another active member. You will be demoted to an administrator.
              </p>
            </div>
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-800 hover:bg-red-700 transition-colors shrink-0"
            >
              Transfer Ownership
            </button>
          </div>

          {/* Archive Organisation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-950/80 border border-red-900/30 gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-200">Archive Organisation</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Make this organisation read-only and hide it from platform directory.
              </p>
            </div>
            <button
              onClick={() => setShowArchiveModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800 hover:bg-amber-900 transition-colors shrink-0 flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" /> Archive Org
            </button>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Transfer Ownership</h3>
            </div>
            <p className="text-xs text-slate-400">
              Select an active member to receive primary ownership of <span className="text-white font-semibold">{org?.name}</span>.
              This action cannot be undone by yourself once transferred.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">New Owner</label>
              <select
                value={transferTargetUserId}
                onChange={(e) => setTransferTargetUserId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-red-500"
              >
                <option value="">Select an active member...</option>
                {members
                  .filter((m) => m.role !== 'ORGANISATION_OWNER')
                  .map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} ({m.user.email})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={submitting || !transferTargetUserId}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke All Sessions Modal */}
      {showRevokeSessionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Revoke All Active Sessions?</h3>
            </div>
            <p className="text-xs text-slate-400">
              This will increment the access version from <span className="font-mono text-cyan-400">{org?.accessSettings?.accessVersion || 1}</span> to <span className="font-mono text-cyan-400">{(org?.accessSettings?.accessVersion || 1) + 1}</span>.
              All active guest passes and cached sessions will be instantly invalidated.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRevokeSessionsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeAllSessions}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Revoking...' : 'Revoke All Sessions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-400">
              <Archive className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Archive Organisation?</h3>
            </div>
            <p className="text-xs text-slate-400">
              Archiving <span className="text-white font-semibold">{org?.name}</span> will suspend normal access to galleries and remove the organisation from public discovery.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveOrganisation}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
