'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  MapPin,
  Users,
  Shield,
  Lock,
  ArrowRight,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
} from 'lucide-react';

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  officialEmail: string;
  contactPhone?: string;
  country?: string;
  state?: string;
  city?: string;
  website?: string;
  logoUrl?: string;
  coverUrl?: string;
  privacy: string;
  status: string;
  _count: {
    members: number;
  };
  accessSettings?: {
    enabled: boolean;
  };
  userMembership?: {
    role: string;
    status: string;
  } | null;
}

export default function OrganisationGatePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.slug) return;

    fetch(`/api/organisations/${params.slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setOrg(data.data);
        } else {
          setError(data.error?.message || 'Organisation not found.');
        }
      })
      .catch(() => setError('Failed to load organisation details.'))
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="max-w-md mx-auto my-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Unavailable</h2>
        <p className="text-sm text-slate-400 mb-6">{error || 'Organisation could not be located.'}</p>
        <Link
          href="/organisations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      <Link
        href="/organisations"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Directory
      </Link>

      <div className="rounded-3xl bg-slate-900/60 border border-slate-800/80 overflow-hidden backdrop-blur-xl shadow-2xl">
        {/* Cover Banner */}
        <div className="h-44 sm:h-56 bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 relative border-b border-slate-800/80">
          <div className="absolute inset-0 bg-radial-gradient opacity-30" />
        </div>

        {/* Header Profile Info */}
        <div className="px-6 sm:px-10 pb-10 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 -mt-16 sm:-mt-20 mb-8">
            <div className="flex items-end gap-5">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-slate-950 border-2 border-cyan-500/40 p-1 shadow-2xl flex items-center justify-center text-cyan-400 font-extrabold text-3xl">
                {org.logoUrl ? (
                  <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  org.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{org.name}</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                    {org.type.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">@{org.slug}</p>
              </div>
            </div>

            {/* Action Button */}
            <div className="self-start sm:self-end">
              {org.userMembership ? (
                <Link
                  href={`/organisations/${org.slug}/dashboard`}
                  className="px-6 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  <span>Enter Dashboard ({org.userMembership.role.replace('_', ' ')})</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  href={`/organisations/${org.slug}/access`}
                  className="px-6 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 transition-all inline-flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Enter Access Password</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>

          {/* Description & Metadata */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4 border-t border-slate-800/80">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">About Organisation</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                {org.description || 'Welcome to our centralised media platform for event photos and videos.'}
              </p>
            </div>

            <div className="space-y-3 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80 text-xs">
              <h3 className="font-semibold text-white uppercase tracking-wider mb-2">Details</h3>
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>{[org.city, org.state, org.country].filter(Boolean).join(', ') || 'Global'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>{org._count.members} Registered Members</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Mail className="w-4 h-4 text-blue-400" />
                <span>{org.officialEmail}</span>
              </div>
              {org.website && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-cyan-400">
                    {org.website}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
