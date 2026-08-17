'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Users,
  ArrowLeft,
  UserPlus,
  Shield,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Mail,
  ShieldCheck,
} from 'lucide-react';

interface TeamMember {
  id: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

export default function TeamManagementPage() {
  const params = useParams<{ slug: string }>();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'SOCIAL_MEDIA_MANAGER' | 'SOCIAL_MEDIA_MEMBER' | 'MODERATOR'>('SOCIAL_MEDIA_MEMBER');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchTeam = () => {
    if (!params.slug) return;
    setLoading(true);
    fetch(`/api/organisations/${params.slug}/team`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setMembers(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeam();
  }, [params.slug]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setActionLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/organisations/${params.slug}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: resData.message || 'Member added to team.' });
        setShowAddModal(false);
        setInviteEmail('');
        fetchTeam();
      } else {
        setFeedback({ type: 'error', message: resData.error?.message || 'Failed to add member.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organisations/${params.slug}/team/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const resData = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Member role updated successfully.' });
        fetchTeam();
      } else {
        setFeedback({ type: 'error', message: resData.error?.message || 'Failed to change role.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the Media Team?`)) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organisations/${params.slug}/team/${userId}`, {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Member removed from team.' });
        fetchTeam();
      } else {
        setFeedback({ type: 'error', message: resData.error?.message || 'Failed to remove member.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/organisations/${params.slug}/media-team`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Media Team Hub
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Team & Permissions Management
          </h1>
          <p className="text-sm text-slate-400">
            Control access to official event uploads, albums, bulk publishing, and batch pipelines.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Team Member</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border border-red-800/60 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Role Descriptions Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
          <span className="font-bold text-cyan-400">Social Media Manager</span>
          <p className="text-slate-400">
            Full batch upload rights, album creation & reassignment, bulk publishing, retry, and archiving.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
          <span className="font-bold text-indigo-400">Social Media Member</span>
          <p className="text-slate-400">
            Batch creation and official uploads for assigned events. Cannot delete other members' batches.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
          <span className="font-bold text-amber-400">Organisation Admin / Owner</span>
          <p className="text-slate-400">
            Full governance, member role assignments, storage quota management, and access password configuration.
          </p>
        </div>
      </div>

      {/* Team Members List */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Active Media Team ({members.length})</h2>
        </div>

        <div className="divide-y divide-slate-800">
          {members.map((member) => (
            <div
              key={member.id}
              className="p-5 hover:bg-slate-800/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-cyan-400">
                  {member.user.avatarUrl ? (
                    <img
                      src={member.user.avatarUrl}
                      alt={member.user.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    member.user.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm text-white">{member.user.name}</div>
                  <div className="text-xs text-slate-400">{member.user.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {['ORGANISATION_OWNER', 'ORGANISATION_ADMIN'].includes(member.role) ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800">
                    {member.role.replace('_', ' ')}
                  </span>
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="SOCIAL_MEDIA_MANAGER">Social Media Manager</option>
                    <option value="SOCIAL_MEDIA_MEMBER">Social Media Member</option>
                    <option value="MODERATOR">Moderator</option>
                  </select>
                )}

                {!['ORGANISATION_OWNER', 'ORGANISATION_ADMIN'].includes(member.role) && (
                  <button
                    onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                    disabled={actionLoading}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                    title="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">Add Media Team Member</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter user email to assign Social Media Team privileges.
              </p>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">User Email *</label>
                <input
                  type="email"
                  required
                  placeholder="colleague@domain.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Assigned Role *</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="SOCIAL_MEDIA_MEMBER">Social Media Member (Upload & Manage)</option>
                  <option value="SOCIAL_MEDIA_MANAGER">Social Media Manager (Full Rights & Publish)</option>
                  <option value="MODERATOR">Moderator (Review & Moderate)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-500 hover:bg-cyan-400 shadow-md transition disabled:opacity-50"
                >
                  {actionLoading ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
