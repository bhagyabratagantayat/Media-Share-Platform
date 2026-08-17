import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { UploadBatchStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId') || undefined;
    const status = (searchParams.get('status') as UploadBatchStatus) || undefined;
    const createdBy = searchParams.get('createdBy') || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

    const result = await BatchService.listBatches(
      {
        organisationId: org.id,
        eventId,
        status,
        createdBy,
        cursor,
        limit,
      },
      user.userId
    );

    return NextResponse.json({
      success: true,
      data: result.items,
      meta: result.meta,
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
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const body = await request.json();

    const batch = await BatchService.createBatch({
      organisationId: org.id,
      eventId: body.eventId,
      albumId: body.albumId,
      userId: user.userId,
      uploadType: body.uploadType,
      visibility: body.visibility,
      files: body.files,
    });

    return NextResponse.json(
      {
        success: true,
        data: batch,
        message: 'Upload batch created successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
