import React from 'react';
import { ShieldCheck, Layers, Lock, Cpu, Database } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16 text-center max-w-5xl mx-auto">
      <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-semibold tracking-wide text-cyan-400 uppercase bg-cyan-950/60 border border-cyan-800/50 rounded-full">
        <ShieldCheck className="w-4 h-4 text-cyan-400" />
        Phase 1 Foundation Active
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
        Organisation Event Media & <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500">
          Digital Memories Platform
        </span>
      </h1>

      <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mb-12">
        A production-grade, multi-tenant digital media archive engineered for colleges, universities, and enterprises.
        Decoupled direct storage, Argon2id security, and high-concurrency architecture.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Multi-Tenant Isolation</h3>
          <p className="text-sm text-slate-400">
            Strict tenant boundaries and row-level authorization guards preventing cross-tenant data leakage.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Argon2id & RBAC</h3>
          <p className="text-sm text-slate-400">
            Cryptographically secure Argon2id password hashing and fine-grained 7-tier role permissions.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Zero-Proxy Storage</h3>
          <p className="text-sm text-slate-400">
            Direct-to-S3 uploads and CDN edge delivery designed to scale past 500+ concurrent active users.
          </p>
        </div>
      </div>
    </main>
  );
}
