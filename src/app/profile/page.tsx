'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Building2,
  Shield,
  PlusCircle,
  LogOut,
  Mail,
  Calendar,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  status: string;
  isPlatformAdmin: boolean;
  avatarUrl?: string;
  createdAt: string;
  lastLoginAt?: string;
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    createdAt: string;
    organisation: {
      id: string;
      name: string;
      slug: string;
      type: string;
      city?: string;
      logoUrl?: string;
      status: string;
    };
  }>;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        const json = await res.json();
        if (res.ok && json.success) {
          setProfile(json.data);
        } else {
          router.push('/login');
        }
      })
      .catch(() => setError('Failed to load user profile.'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      {/* Profile Header */}
      <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-2xl mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-cyan-500/20">
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">{profile.name}</h1>
              {profile.isPlatformAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                  PLATFORM ADMIN
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400 mt-1.5">
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                {profile.email}
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {profile.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/organisations/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Create Organisation
          </Link>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 border border-red-900/60 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      {/* My Organisations Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            My Organisations ({profile.memberships.length})
          </h2>
          <Link href="/organisations" className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold">
            Browse Directory →
          </Link>
        </div>

        {profile.memberships.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No Organisation Memberships Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-6">
              Create a new organisation or enter an organisation&apos;s access password to join.
            </p>
            <Link
              href="/organisations/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Create Your First Organisation
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profile.memberships.map((m) => (
              <div
                key={m.id}
                className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-base">
                      {m.organisation.logoUrl ? (
                        <img
                          src={m.organisation.logoUrl}
                          alt={m.organisation.name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        m.organisation.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                      {m.role.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                    {m.organisation.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-mono">@{m.organisation.slug}</p>
                </div>

                <Link
                  href={`/organisations/${m.organisation.slug}/dashboard`}
                  className="mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-cyan-600 transition-colors flex items-center justify-center gap-2"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
