import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { listMediaByEvent, createMediaMetadata } from '@/server/media/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { organisationId: true },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 }
      );
    }

    const { user, userRole, hasOrgAccess } = await getOrganisationAuthContext(event.organisationId);

    const { searchParams } = new URL(request.url);
    const albumId = searchParams.get('albumId') || undefined;
    const mediaType = (searchParams.get('mediaType') as any) || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 24;

    const result = await listMediaByEvent({
      eventId: params.eventId,
      albumId,
      mediaType,
      cursor,
      limit,
      userRole,
      hasOrgAccess,
      userId: user?.userId,
    });

    const serializedItems = result.items.map((item) => ({
      ...item,
      fileSize: Number(item.fileSize),
    }));

    return NextResponse.json({
      success: true,
      data: serializedItems,
      meta: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const user = await requireSessionUser();

    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, organisationId: true },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 }
      );
    }

    const body = await request.json();

    const media = await createMediaMetadata({
      organisationId: event.organisationId,
      eventId: event.id,
      albumId: body.albumId,
      uploaderId: user.userId,
      mediaType: body.mediaType,
      originalFileName: body.originalFileName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      width: body.width,
      height: body.height,
      durationMs: body.durationMs,
      frameRate: body.frameRate,
      codec: body.codec,
      checksum: body.checksum,
      visibility: body.visibility,
      approvalStatus: body.approvalStatus,
      faceSearchEnabled: body.faceSearchEnabled,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...media,
          fileSize: Number(media.fileSize),
        },
        message: 'Media metadata created successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
