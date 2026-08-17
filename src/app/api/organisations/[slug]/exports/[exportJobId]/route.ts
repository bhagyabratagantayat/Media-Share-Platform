import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { ExportService } from '@/server/export/export-service';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

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

    return NextResponse.json({
      success: true,
      data: exportJob,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
