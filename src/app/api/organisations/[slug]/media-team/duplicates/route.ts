import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { handleApiError, NotFoundError } from '@/lib/errors';

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

    const result = await BatchService.checkDuplicates(
      org.id,
      body.eventId,
      body.files || [],
      user.userId
    );

    return NextResponse.json({
      success: true,
      data: result.duplicates,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
