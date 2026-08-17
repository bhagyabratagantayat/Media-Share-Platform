import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent, getEventById, listEvents, updateEvent, archiveEvent } from '@/server/events/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { EventStatus, EventVisibility } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockEventCreate = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockEventFindMany = vi.fn();
  const mockEventUpdate = vi.fn();
  const mockMediaItemCount = vi.fn();
  const mockAuditLogCreate = vi.fn();
  const mockUserFindUnique = vi.fn();
  const mockMemberFindUnique = vi.fn();

  return {
    prisma: {
      event: {
        create: mockEventCreate,
        findUnique: mockEventFindUnique,
        findMany: mockEventFindMany,
        update: mockEventUpdate,
      },
      mediaItem: {
        count: mockMediaItemCount,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      user: {
        findUnique: mockUserFindUnique,
      },
      organisationMember: {
        findUnique: mockMemberFindUnique,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          event: {
            create: mockEventCreate,
            update: mockEventUpdate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 3: Events Service & RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully creates an event for an authorised organisation manager', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_owner_1',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_1',
      role: ROLES.ORGANISATION_OWNER,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.event.findUnique).mockResolvedValue(null); // No slug collision

    const createdRecord = {
      id: 'evt_101',
      organisationId: 'org_abc',
      name: 'Independence Day 2026',
      slug: 'independence-day-2026',
      description: 'Annual cultural celebration',
      eventDate: new Date('2026-08-15'),
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.ORGANISATION,
      allowUserUploads: true,
      allowDownloads: true,
      faceSearchEnabled: true,
      createdBy: 'usr_owner_1',
    };

    vi.mocked(prisma.event.create).mockResolvedValue(createdRecord as any);

    const result = await createEvent({
      organisationId: 'org_abc',
      name: 'Independence Day 2026',
      description: 'Annual cultural celebration',
      eventDate: '2026-08-15',
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.ORGANISATION,
      allowUserUploads: true,
      faceSearchEnabled: true,
      createdByUserId: 'usr_owner_1',
    });

    expect(result.id).toBe('evt_101');
    expect(result.slug).toBe('independence-day-2026');
    expect(prisma.event.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EVENT_CREATED',
          resourceType: 'EVENT',
          resourceId: 'evt_101',
        }),
      })
    );
  });

  it('rejects event creation by regular USER role without manager rights', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_normal',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_2',
      role: ROLES.USER,
      status: 'ACTIVE',
    } as any);

    await expect(
      createEvent({
        organisationId: 'org_abc',
        name: 'Unauthorised Event',
        eventDate: '2026-09-01',
        createdByUserId: 'usr_normal',
      })
    ).rejects.toThrow(/Access denied/);
  });

  it('enforces slug uniqueness within the same organisation', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_admin',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_3',
      role: ROLES.ORGANISATION_ADMIN,
      status: 'ACTIVE',
    } as any);

    // Existing event found with same slug
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_existing',
      slug: 'annual-fest',
    } as any);

    await expect(
      createEvent({
        organisationId: 'org_abc',
        name: 'Annual Fest',
        eventDate: '2026-10-01',
        createdByUserId: 'usr_admin',
      })
    ).rejects.toThrow(/already exists in this organisation/);
  });

  it('lists events with server-side pagination and filters', async () => {
    const mockEvents = [
      {
        id: 'evt_1',
        name: 'Event One',
        eventDate: new Date('2026-08-15'),
        status: EventStatus.PUBLISHED,
        _count: { albums: 2, mediaItems: 10 },
      },
      {
        id: 'evt_2',
        name: 'Event Two',
        eventDate: new Date('2026-08-10'),
        status: EventStatus.PUBLISHED,
        _count: { albums: 1, mediaItems: 5 },
      },
    ];

    vi.mocked(prisma.event.findMany).mockResolvedValue(mockEvents as any);

    const result = await listEvents({
      organisationId: 'org_abc',
      limit: 10,
      userRole: ROLES.USER,
      hasOrgAccess: true,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('soft-archives an event instead of permanent deletion', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_to_archive',
      organisationId: 'org_abc',
      status: EventStatus.PUBLISHED,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_owner',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_owner',
      role: ROLES.ORGANISATION_OWNER,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.event.update).mockResolvedValue({
      id: 'evt_to_archive',
      status: EventStatus.ARCHIVED,
    } as any);

    const result = await archiveEvent('evt_to_archive', 'usr_owner');

    expect(result.status).toBe(EventStatus.ARCHIVED);
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt_to_archive' },
        data: expect.objectContaining({ status: EventStatus.ARCHIVED }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EVENT_ARCHIVED',
        }),
      })
    );
  });
});
