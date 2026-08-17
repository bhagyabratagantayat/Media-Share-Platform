import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { ExportService } from '@/server/export/export-service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function POST(
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

    const { userRole } = await getOrganisationAuthContext(org.id);
    const sessionUser = await requireSessionUser();

    const cancelledJob = await ExportService.cancelExportJob(
      params.exportJobId,
      sessionUser.userId,
      userRole,
      org.id
    );

    return NextResponse.json({
      success: true,
      data: cancelledJob,
      message: 'Export job cancelled successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
