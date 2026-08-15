'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  Shield,
  Users,
  Settings,
  Image,
  Video,
  Calendar,
  BarChart3,
  HardDrive,
  Share2,
  Lock,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

interface DashboardData {
  organisation: {
    id: string;
    name: string;
    slug: string;
    type: string;
    description?: string;
    city?: string;
    state?: string;
    country?: string;
    logoUrl?: string;
    coverUrl?: string;
    status: string;
    privacy: string;
    createdAt: string;
    memberCount: number;
  };
  access: {
    hasAccess: boolean;
    userRole: string;
    isMember: boolean;
    accessSettingsEnabled: boolean;
  };
}

export default function OrganisationDashboardPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.slug) return;

    fetch(`/api/organisations/${params.slug}/dashboard`)
      .then(async (res) => {
        const json = await res.json();
        if (res.ok && json.success) {
          setData(json.data);
        } else {
          setError(json.error?.message || 'Access restricted. Please unlock with organisation password.');
        }
      })
      .catch(() => setError('Failed to load organisation dashboard.'))
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-auto px-4 py-16 text-center">
        <Lock className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Protected Digital Space</h2>
        <p className="text-sm text-slate-400 mb-6">{error || 'Access to this organisation requires verification.'}</p>
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/organisations/${params.slug}/access`}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
          >
            Enter Access Password
          </Link>
          <Link
            href="/organisations"
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const { organisation: org, access } = data;
  const isOwnerOrAdmin = access.userRole === 'ORGANISATION_OWNER' || access.userRole === 'ORGANISATION_ADMIN' || access.userRole === 'PLATFORM_ADMIN';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header Breadcrumbs & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/organisations"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Organisations
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {org.name}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              {org.type.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            Role: <span className="text-white">{access.userRole.replace('_', ' ')}</span>
          </span>

          {isOwnerOrAdmin && (
            <Link
              href={`/organisations/${org.slug}/settings`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <Settings className="w-3.5 h-3.5 text-slate-300" />
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-xs text-slate-400 block mb-1">Status</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold text-base text-white">{org.status}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-xs text-slate-400 block mb-1">Members</span>
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-base text-white">{org.memberCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-xs text-slate-400 block mb-1">Privacy Mode</span>
          <span className="font-bold text-base text-white">{org.privacy}</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-xs text-slate-400 block mb-1">Established</span>
          <span className="font-bold text-base text-white">
            {new Date(org.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Media & Event Modules (Phase 3+ Previews) */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
          Digital Memory Archives
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-white">Events & Festivals</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Categorised event folders (Annual Fests, Tech Symposiums, Convocations, Sports).
            </p>
            <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 text-slate-400">
              Coming in Phase 3
            </span>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Image className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-white">Photo Galleries</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Multi-resolution image pipelines with automatic WebP compression and CDN delivery.
            </p>
            <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 text-slate-400">
              Coming in Phase 4
            </span>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-4">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-white">Video Hub</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              High-definition event recordings processed via asynchronous background workers.
            </p>
            <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 text-slate-400">
              Coming in Phase 4
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
