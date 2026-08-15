'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Search,
  MapPin,
  Users,
  Shield,
  ArrowRight,
  PlusCircle,
  Filter,
} from 'lucide-react';

interface OrganisationItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  city?: string;
  state?: string;
  country?: string;
  logoUrl?: string;
  privacy: string;
  status: string;
  _count: {
    members: number;
  };
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

const ORG_TYPES = [
  'ALL',
  'COLLEGE',
  'UNIVERSITY',
  'SCHOOL',
  'INSTITUTE',
  'COMPANY',
  'NGO',
  'CLUB',
  'EVENT_ORGANISATION',
];

export default function OrganisationsDirectoryPage() {
  const [organisations, setOrganisations] = useState<OrganisationItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchOrganisations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedType !== 'ALL') params.set('type', selectedType);
      if (city.trim()) params.set('city', city.trim());
      params.set('page', page.toString());
      params.set('limit', '9');

      const res = await fetch(`/api/organisations?${params.toString()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        setOrganisations(data.data);
        setPagination(data.meta?.pagination || null);
      }
    } catch {
      setOrganisations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganisations();
  }, [page, selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrganisations();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Discover Organisations
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Browse active colleges, universities, companies, and clubs on the platform.
          </p>
        </div>
        <Link
          href="/organisations/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition-all self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Create Organisation
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-8 backdrop-blur-md">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by organisation name or keyword..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="sm:col-span-3">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Filter by city..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="sm:col-span-3 flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCity('');
                setSelectedType('ALL');
                setPage(1);
                setTimeout(fetchOrganisations, 0);
              }}
              className="py-2.5 px-3 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition-colors"
            >
              Reset
            </button>
          </div>
        </form>

        {/* Type Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-4 mt-4 border-t border-slate-800/60 pb-1 scrollbar-none">
          <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5" /> Type:
          </span>
          {ORG_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setSelectedType(t);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                selectedType === t
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-400">Loading organisations...</p>
        </div>
      ) : organisations.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800/60">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No organisations found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or register a new organisation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organisations.map((org) => (
            <div
              key={org.id}
              className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between group shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-lg group-hover:scale-105 transition-transform">
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      org.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    {org.type.replace('_', ' ')}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                  {org.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                  {org.description || 'Digital event media and memory archive.'}
                </p>

                <div className="flex items-center gap-4 text-xs text-slate-400 mt-4 pt-4 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    {org.city || 'Global'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    {org._count.members} Members
                  </span>
                </div>
              </div>

              <Link
                href={`/organisations/${org.slug}`}
                className="mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-cyan-600 transition-colors flex items-center justify-center gap-2 group-hover:shadow-md"
              >
                <span>Enter Organisation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800/80">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
