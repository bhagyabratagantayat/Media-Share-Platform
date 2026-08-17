import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/server/db/prisma';
import { getSessionUser } from '@/server/auth/session';
import { DirectUploader } from '@/components/upload/DirectUploader';
import { canCreateMediaMetadata } from '@/server/permissions/event-guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { ChevronLeft, ShieldCheck, Sparkles, AlertCircle, HardDrive } from 'lucide-react';

interface EventUploadPageProps {
  params: {
    slug: string;
    eventSlug: string;
  };
}

export default async function EventUploadPage({ params }: EventUploadPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/login?redirect=/organisations/${params.slug}/events/${params.eventSlug}/upload`);
  }

  const org = await prisma.organisation.findUnique({
    where: { slug: params.slug },
    include: {
      quota: true,
      members: {
        where: { userId: user.userId },
      },
    },
  });

  if (!org) {
    notFound();
  }

  const userRole: RoleType = user.isPlatformAdmin
    ? ROLES.PLATFORM_ADMIN
    : (org.members[0]?.role as RoleType) || ROLES.USER;

  const event = await prisma.event.findUnique({
    where: {
      unique_org_event_slug: {
        organisationId: org.id,
        slug: params.eventSlug,
      },
    },
    include: {
      albums: {
        where: { status: 'PUBLISHED' },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!event) {
    notFound();
  }

  if (!canCreateMediaMetadata(userRole, event.allowUserUploads)) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">Upload Access Restricted</h1>
          <p className="text-sm text-slate-400">
            User submissions are disabled for this event, and you do not have staff permissions to upload media.
          </p>
          <Link
            href={`/organisations/${params.slug}/events/${params.eventSlug}`}
            className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
          >
            Back to Event Gallery
          </Link>
        </div>
      </div>
    );
  }

  const usedBytes = Number(org.quota?.storageUsedBytes || 0);
  const limitBytes = Number(org.quota?.storageLimitBytes || 53687091200);
  const usedPercent = Math.min(Math.round((usedBytes / limitBytes) * 100), 100);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <Link
              href={`/organisations/${params.slug}/events/${params.eventSlug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-indigo-400 transition-colors mb-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to {event.name}
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              Upload Media
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Phase 4 Direct S3
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Upload original high-definition memories to <span className="text-white font-medium">{event.name}</span> in <span className="text-white font-medium">{org.name}</span>.
            </p>
          </div>

          {/* Storage Quota Pill */}
          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-300 gap-4">
                <span>Org Storage</span>
                <span>{usedPercent}%</span>
              </div>
              <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security & Direct Upload Callout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-800/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-white">Direct-to-Storage Isolation</p>
              <p className="text-slate-400">
                Files upload directly from your browser to private object storage via short-lived signed URLs. No binaries pass through the web server.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-800/30 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-white">Large Video & Multipart Support</p>
              <p className="text-slate-400">
                Large videos (up to 2GB) are automatically sliced into chunks and uploaded in parallel with automatic checksum verification.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Direct Uploader Component */}
        <DirectUploader
          organisationId={org.id}
          organisationSlug={org.slug}
          eventId={event.id}
          eventSlug={event.slug}
          albums={event.albums}
        />
      </div>
    </main>
  );
}
