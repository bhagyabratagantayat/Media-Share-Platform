'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Building2, ChevronDown, Check, Plus, Shield } from 'lucide-react';

interface OrgMembershipItem {
  organisation: {
    id: string;
    name: string;
    slug: string;
    type: string;
    logoUrl?: string;
    status: string;
  };
  role: string;
  joinedAt: string;
}

export default function OrganisationSwitcher() {
  const params = useParams<{ slug?: string }>();
  const router = useRouter();
  const [organisations, setOrganisations] = useState<OrgMembershipItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/user/organisations')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setOrganisations(data.data);
        }
      })
      .catch(() => setOrganisations([]))
      .finally(() => setLoading(false));
  }, [params.slug]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading || organisations.length === 0) {
    return null;
  }

  const currentOrg = organisations.find((o) => o.organisation.slug === params.slug);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/90 transition-all shadow-sm"
        aria-label="Switch Organisation"
      >
        <div className="w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
          {currentOrg ? currentOrg.organisation.name.slice(0, 1).toUpperCase() : <Building2 className="w-3 h-3" />}
        </div>
        <span className="max-w-[140px] truncate text-xs">
          {currentOrg ? currentOrg.organisation.name : 'Select Tenant'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
            My Organisations ({organisations.length})
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-thin">
            {organisations.map((item) => {
              const isSelected = item.organisation.slug === params.slug;
              return (
                <button
                  key={item.organisation.id}
                  onClick={() => {
                    setIsOpen(false);
                    router.push(`/organisations/${item.organisation.slug}/dashboard`);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/60 border border-cyan-800/60 text-white'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold shrink-0">
                      {item.organisation.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">{item.organisation.name}</p>
                      <p className="text-[10px] text-slate-400">{item.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1.5" />}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80">
            <Link
              href="/organisations/new"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-indigo-400 hover:bg-slate-900 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Organisation</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
