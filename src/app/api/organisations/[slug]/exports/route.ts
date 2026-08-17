import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { ExportService } from '@/server/export/export-service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';
import { ExportScope } from '@prisma/client';

const createExportSchema = z.object({
  scopeType: z.nativeEnum(ExportScope),
  eventId: z.string().uuid().optional().nullable(),
  albumId: z.string().uuid().optional().nullable(),
  mediaIds: z.array(z.string().uuid()).max(1000).optional().nullable(),
  requestedVariant: z.enum(['ORIGINAL', 'OPTIMIZED']).default('OPTIMIZED'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20));

    const result = await ExportService.listExportJobs(org.id, userId, userRole, page, limit);

    return NextResponse.json({
      success: true,
      data: result.items,
      pagination: {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
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

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(org.id);
    const sessionUser = await requireSessionUser();

    const body = await request.json();
    const parsed = createExportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid export request payload.',
            details: parsed.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const exportJob = await ExportService.createExportJob({
      organisationId: org.id,
      userId: sessionUser.userId,
      userRole,
      hasOrgAccess,
      scopeType: parsed.data.scopeType,
      eventId: parsed.data.eventId,
      albumId: parsed.data.albumId,
      mediaIds: parsed.data.mediaIds,
      requestedVariant: parsed.data.requestedVariant,
    });

    return NextResponse.json(
      {
        success: true,
        data: exportJob,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
