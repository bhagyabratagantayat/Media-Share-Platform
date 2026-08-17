import { describe, it, expect } from 'vitest';
import {
  canViewEvent,
  canViewMedia,
  canCreateEvent,
  canArchiveEvent,
} from '@/server/permissions/event-guards';
import { ROLES } from '@/server/permissions/roles';
import {
  EventStatus,
  EventVisibility,
  MediaStatus,
  MediaVisibility,
  ApprovalStatus,
} from '@prisma/client';

describe('Phase 3: Multi-Layered Security & RBAC Guards', () => {
  const baseEvent = {
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.ORGANISATION,
    organisationId: 'org_1',
  };

  const baseMedia = {
    status: MediaStatus.READY,
    visibility: MediaVisibility.ORGANISATION,
    approvalStatus: ApprovalStatus.NOT_REQUIRED,
    uploaderId: 'usr_uploader_1',
  };

  it('restricts DRAFT and ARCHIVED events to staff members', () => {
    const draftEvent = { ...baseEvent, status: EventStatus.DRAFT };
    const archivedEvent = { ...baseEvent, status: EventStatus.ARCHIVED };

    // Guest or public viewer -> DENIED
    expect(canViewEvent(draftEvent, null, false)).toBe(false);
    expect(canViewEvent(draftEvent, ROLES.USER, true)).toBe(false);
    expect(canViewEvent(archivedEvent, null, false)).toBe(false);
    expect(canViewEvent(archivedEvent, ROLES.USER, true)).toBe(false);

    // Staff roles -> ALLOWED
    expect(canViewEvent(draftEvent, ROLES.ORGANISATION_OWNER, true)).toBe(true);
    expect(canViewEvent(draftEvent, ROLES.ORGANISATION_ADMIN, true)).toBe(true);
    expect(canViewEvent(draftEvent, ROLES.SOCIAL_MEDIA_MANAGER, true)).toBe(true);
    expect(canViewEvent(archivedEvent, ROLES.ORGANISATION_ADMIN, true)).toBe(true);
  });

  it('evaluates ORGANISATION-scoped event access via membership OR pass ticket', () => {
    const orgEvent = { ...baseEvent, visibility: EventVisibility.ORGANISATION };

    // Anonymous without ticket -> DENIED
    expect(canViewEvent(orgEvent, null, false)).toBe(false);

    // Member -> ALLOWED
    expect(canViewEvent(orgEvent, ROLES.USER, false)).toBe(true);

    // Guest with valid pass ticket -> ALLOWED
    expect(canViewEvent(orgEvent, null, true)).toBe(true);
  });

  it('evaluates media approval status (PENDING/REJECTED hidden from public/guests)', () => {
    const pendingMedia = { ...baseMedia, approvalStatus: ApprovalStatus.PENDING };
    const rejectedMedia = { ...baseMedia, approvalStatus: ApprovalStatus.REJECTED };

    // Guest pass holder -> DENIED
    expect(canViewMedia(pendingMedia, baseEvent, null, true, 'usr_stranger')).toBe(false);
    expect(canViewMedia(rejectedMedia, baseEvent, null, true, 'usr_stranger')).toBe(false);

    // Original Uploader -> ALLOWED to view their own pending/rejected item
    expect(canViewMedia(pendingMedia, baseEvent, ROLES.USER, true, 'usr_uploader_1')).toBe(true);

    // Organisation Admin / Manager -> ALLOWED
    expect(canViewMedia(pendingMedia, baseEvent, ROLES.ORGANISATION_ADMIN, true, 'usr_admin')).toBe(true);
    expect(canViewMedia(pendingMedia, baseEvent, ROLES.SOCIAL_MEDIA_MANAGER, true, 'usr_mgr')).toBe(true);
  });

  it('evaluates soft-deleted and failed media items visibility', () => {
    const deletedMedia = { ...baseMedia, status: MediaStatus.DELETED };
    const failedMedia = { ...baseMedia, status: MediaStatus.FAILED };

    // Other users cannot view deleted media
    expect(canViewMedia(deletedMedia, baseEvent, ROLES.USER, true, 'usr_other')).toBe(false);
    expect(canViewMedia(failedMedia, baseEvent, ROLES.USER, true, 'usr_other')).toBe(false);

    // Staff or uploader can view
    expect(canViewMedia(deletedMedia, baseEvent, ROLES.ORGANISATION_OWNER, true, 'usr_owner')).toBe(true);
    expect(canViewMedia(deletedMedia, baseEvent, ROLES.USER, true, 'usr_uploader_1')).toBe(true);
  });

  it('strictly validates event creation and archiving role rules', () => {
    expect(canCreateEvent(ROLES.PLATFORM_ADMIN)).toBe(true);
    expect(canCreateEvent(ROLES.ORGANISATION_OWNER)).toBe(true);
    expect(canCreateEvent(ROLES.ORGANISATION_ADMIN)).toBe(true);
    expect(canCreateEvent(ROLES.SOCIAL_MEDIA_MANAGER)).toBe(true);

    expect(canCreateEvent(ROLES.SOCIAL_MEDIA_MEMBER)).toBe(false);
    expect(canCreateEvent(ROLES.MODERATOR)).toBe(false);
    expect(canCreateEvent(ROLES.USER)).toBe(false);

    // Archiving is restricted to Owner & Admin
    expect(canArchiveEvent(ROLES.ORGANISATION_ADMIN)).toBe(true);
    expect(canArchiveEvent(ROLES.ORGANISATION_OWNER)).toBe(true);
    expect(canArchiveEvent(ROLES.SOCIAL_MEDIA_MANAGER)).toBe(false);
    expect(canArchiveEvent(ROLES.USER)).toBe(false);
  });
});
