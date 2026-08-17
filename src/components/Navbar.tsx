'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, Building2, PlusCircle, User, LogOut, LogIn } from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import OrganisationSwitcher from '@/components/OrganisationSwitcher';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
}

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.success && data?.data) {
          setUser(data.data);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-sm tracking-tight text-white group-hover:text-cyan-400 transition-colors">
              Media Share Platform
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Digital Memories
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/organisations"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition-all"
          >
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Organisations</span>
          </Link>

          {!loading && user && <OrganisationSwitcher />}

          {!loading && user ? (
            <>
              <NotificationBell />
              <Link
                href="/organisations/new"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition-all"
              >
                <PlusCircle className="w-4 h-4 text-indigo-400" />
                <span>New Org</span>
              </Link>
              <Link
                href="/profile"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition-all"
              >
                <User className="w-4 h-4 text-blue-400" />
                <span>{user.name.split(' ')[0]}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-400 hover:text-red-300 rounded-lg hover:bg-red-950/40 transition-all"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : !loading ? (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition-all"
              >
                <LogIn className="w-4 h-4 text-slate-400" />
                <span>Login</span>
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-lg shadow-md shadow-cyan-500/20 transition-all"
              >
                Register
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
