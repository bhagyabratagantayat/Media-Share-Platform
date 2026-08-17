'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Lock, AlertCircle, ArrowLeft, ArrowRight, LogIn } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

export default function CreateOrganisationPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    type: 'COLLEGE',
    officialEmail: '',
    contactPhone: '',
    country: '',
    state: '',
    city: '',
    website: '',
    description: '',
    privacy: 'DISCOVERABLE',
    accessPassword: '',
    confirmAccessPassword: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecking(false);
      if (user?.email && !formData.officialEmail) {
        setFormData((prev) => ({ ...prev, officialEmail: user.email || '' }));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleNameChange = (name: string) => {
    const autoSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    setFormData((prev) => ({ ...prev, name, slug: autoSlug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.accessPassword !== formData.confirmAccessPassword) {
      setError('Access passwords do not match.');
      return;
    }

    if (formData.accessPassword.length < 6) {
      setError('Organisation access password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // 1. Ensure Firebase session is synced if user is authenticated in Firebase
      if (auth.currentUser) {
        await fetch('/api/auth/firebase-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName,
            photoURL: auth.currentUser.photoURL,
          }),
        });
      }

      // 2. Submit organisation creation
      const res = await fetch('/api/organisations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401) {
          setError('You must be logged in to create an organisation. Please sign in first.');
        } else {
          setError(data.error?.message || 'Failed to create organisation.');
        }
        return;
      }

      router.push(`/organisations/${data.data.slug}`);
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 w-full">
      <Link
        href="/organisations"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Directory
      </Link>

      {!authChecking && !currentUser && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>You are not logged in. Please sign in or create an account first.</span>
          </div>
          <Link
            href="/login"
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </Link>
        </div>
      )}

      <div className="p-8 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Create Organisation</h1>
            <p className="text-xs text-slate-400">
              Establish a secure digital media space for your institution or company
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              1. Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organisation Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Bhubaneswar Engineering College"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Unique Slug (URL Handle) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="bhubaneswar-engineering-college"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organisation Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="COLLEGE">College</option>
                  <option value="UNIVERSITY">University</option>
                  <option value="SCHOOL">School</option>
                  <option value="INSTITUTE">Institute</option>
                  <option value="COMPANY">Company</option>
                  <option value="NGO">NGO</option>
                  <option value="CLUB">Club / Society</option>
                  <option value="EVENT_ORGANISATION">Event Organisation</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Official Contact Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.officialEmail}
                  onChange={(e) => setFormData({ ...formData, officialEmail: e.target.value })}
                  placeholder="admin@college.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description / Purpose
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief summary of your organisation..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              2. Location & Privacy
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Bhubaneswar"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">State / Province</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="Odisha"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="India"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Directory Privacy Mode</label>
              <select
                value={formData.privacy}
                onChange={(e) => setFormData({ ...formData, privacy: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="DISCOVERABLE">Discoverable (Listed in directory with password gate)</option>
                <option value="PUBLIC">Public (Publicly accessible)</option>
                <option value="PRIVATE">Private (Hidden from public directory)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                3. Organisation Access Password (Shared Gate)
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              This password will be entered by students/members to enter this organisation&apos;s digital space.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Access Password *
                </label>
                <input
                  type="password"
                  required
                  value={formData.accessPassword}
                  onChange={(e) => setFormData({ ...formData, accessPassword: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm Access Password *
                </label>
                <input
                  type="password"
                  required
                  value={formData.confirmAccessPassword}
                  onChange={(e) => setFormData({ ...formData, confirmAccessPassword: e.target.value })}
                  placeholder="Repeat access password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Establish Organisation</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
