import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { ExportService } from '@/server/export/export-service';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';
import { ExportStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string; exportJobId: string } }
) {
  try {
    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organisation not found.' } },
        { status: 404 }
      );
    }

    const { user, userRole } = await getOrganisationAuthContext(org.id);
    const userId = user ? user.userId : null;

    const exportJob = await ExportService.getExportJob(
      params.exportJobId,
      userId,
      userRole,
      org.id
    );

    if (exportJob.status !== ExportStatus.READY || !exportJob.downloadUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_NOT_READY',
            message: `Export is not ready for download (current status: ${exportJob.status.toLowerCase()}).`,
          },
        },
        { status: 400 }
      );
    }

    // Direct redirect to CDN / Object storage signed URL (Zero binary traffic through application server)
    return NextResponse.redirect(exportJob.downloadUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
