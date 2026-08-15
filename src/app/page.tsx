import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Building2,
  Lock,
  Zap,
  Users,
  CheckCircle2,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 text-xs font-semibold backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Multi-Tenant Digital Memories & Media Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
          Centralised Event Media for{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500">
            Colleges & Organisations
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
          Create an isolated media space for your institution. Secure event photos and videos with
          Argon2id cryptographic access passwords, role-based controls, and high-concurrency architecture.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            href="/organisations"
            className="px-6 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-xl shadow-cyan-500/25 transition-all flex items-center gap-2 group"
          >
            <span>Explore Organisations</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/organisations/new"
            className="px-6 py-3.5 rounded-xl font-semibold text-sm text-slate-200 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all flex items-center gap-2"
          >
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span>Create Organisation</span>
          </Link>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full">
        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-white">Cryptographic Access Gate</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Separate organisation access passwords hashed with Argon2id. Instant session revocation
            upon password rotation.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-white">Strict Multi-Tenant Isolation</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Data partitioned by organisation ID with transactional creation and server-side RBAC
            verification on every request.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-white">500+ Concurrent Scalability</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Stateless JWT passes, server-side pagination, database indexes, and direct object storage
            readiness.
          </p>
        </div>
      </div>
    </main>
  );
}
