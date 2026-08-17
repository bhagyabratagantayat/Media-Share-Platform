import { RoleType, ROLES } from './roles';
import {
  EventStatus,
  EventVisibility,
  AlbumStatus,
  MediaStatus,
  MediaVisibility,
  ApprovalStatus,
} from '@prisma/client';

export const EVENT_ADMIN_ROLES: RoleType[] = [
  ROLES.PLATFORM_ADMIN,
  ROLES.ORGANISATION_OWNER,
  ROLES.ORGANISATION_ADMIN,
  ROLES.SOCIAL_MEDIA_MANAGER,
];

export const ALBUM_ADMIN_ROLES: RoleType[] = [
  ROLES.PLATFORM_ADMIN,
  ROLES.ORGANISATION_OWNER,
  ROLES.ORGANISATION_ADMIN,
  ROLES.SOCIAL_MEDIA_MANAGER,
];

export const EVENT_ARCHIVE_ROLES: RoleType[] = [
  ROLES.PLATFORM_ADMIN,
  ROLES.ORGANISATION_OWNER,
  ROLES.ORGANISATION_ADMIN,
];

export const TEAM_MEMBER_ROLES: RoleType[] = [
  ROLES.PLATFORM_ADMIN,
  ROLES.ORGANISATION_OWNER,
  ROLES.ORGANISATION_ADMIN,
  ROLES.SOCIAL_MEDIA_MANAGER,
  ROLES.SOCIAL_MEDIA_MEMBER,
  ROLES.MODERATOR,
];

export const MODERATOR_STAFF_ROLES: RoleType[] = [
  ROLES.PLATFORM_ADMIN,
  ROLES.ORGANISATION_OWNER,
  ROLES.ORGANISATION_ADMIN,
  ROLES.SOCIAL_MEDIA_MANAGER,
  ROLES.MODERATOR,
];

export function canCreateEvent(role: RoleType): boolean {
  return EVENT_ADMIN_ROLES.includes(role);
}

export function canUpdateEvent(role: RoleType): boolean {
  return EVENT_ADMIN_ROLES.includes(role);
}

export function canPublishEvent(role: RoleType): boolean {
  return EVENT_ADMIN_ROLES.includes(role);
}

export function canArchiveEvent(role: RoleType): boolean {
  return EVENT_ARCHIVE_ROLES.includes(role);
}

export function canRestoreEvent(role: RoleType): boolean {
  return EVENT_ARCHIVE_ROLES.includes(role);
}

export function canSetEventCover(role: RoleType): boolean {
  return EVENT_ADMIN_ROLES.includes(role);
}

export function canCreateAlbum(role: RoleType): boolean {
  return ALBUM_ADMIN_ROLES.includes(role);
}

export function canUpdateAlbum(role: RoleType): boolean {
  return ALBUM_ADMIN_ROLES.includes(role);
}

export function canArchiveAlbum(role: RoleType): boolean {
  return ALBUM_ADMIN_ROLES.includes(role);
}

export function canRestoreAlbum(role: RoleType): boolean {
  return ALBUM_ADMIN_ROLES.includes(role);
}

export function canReorderAlbums(role: RoleType): boolean {
  return ALBUM_ADMIN_ROLES.includes(role);
}

export function canMoveMedia(role: RoleType): boolean {
  return TEAM_MEMBER_ROLES.includes(role);
}

export interface EventAccessContext {
  status: EventStatus;
  visibility: EventVisibility;
  organisationId: string;
}

export function canViewEvent(
  event: EventAccessContext,
  userRole?: RoleType | null,
  hasOrgAccess = false
): boolean {
  // Platform admins can view any event
  if (userRole === ROLES.PLATFORM_ADMIN) return true;

  const isTeamMember = userRole && TEAM_MEMBER_ROLES.includes(userRole);

  // Drafts & Archived events are restricted to organisation staff
  if (event.status === EventStatus.DRAFT || event.status === EventStatus.ARCHIVED) {
    return !!isTeamMember;
  }

  // Private events are restricted to organisation staff
  if (event.visibility === EventVisibility.PRIVATE) {
    return !!isTeamMember;
  }

  // Organisation-scoped events require either membership or a verified organisation pass ticket
  if (event.visibility === EventVisibility.ORGANISATION) {
    return !!userRole || hasOrgAccess;
  }

  // Public events are viewable when published
  return true;
}

export interface MediaAccessContext {
  status: MediaStatus;
  visibility: MediaVisibility;
  approvalStatus: ApprovalStatus;
  isPublished?: boolean;
  uploaderId: string;
}

export function canViewMedia(
  media: MediaAccessContext,
  event: EventAccessContext,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  userId?: string | null
): boolean {
  // Must satisfy base event visibility
  if (!canViewEvent(event, userRole, hasOrgAccess)) {
    return false;
  }

  if (userRole === ROLES.PLATFORM_ADMIN) return true;

  const isStaff = userRole && MODERATOR_STAFF_ROLES.includes(userRole);
  const isUploader = !!userId && media.uploaderId === userId;

  // Soft-deleted or failed items only visible to staff or uploader
  if (media.status === MediaStatus.DELETED || media.status === MediaStatus.FAILED) {
    return !!isStaff || isUploader;
  }

  // Processing or Uploading state only visible to staff or uploader
  if (media.status === MediaStatus.UPLOADING || media.status === MediaStatus.PROCESSING) {
    return !!isStaff || isUploader;
  }

  // Non-approved media (PENDING or REJECTED) only visible to staff or uploader
  if (
    media.approvalStatus === ApprovalStatus.PENDING ||
    media.approvalStatus === ApprovalStatus.REJECTED
  ) {
    return !!isStaff || isUploader;
  }

  // Unpublished media only visible to staff or uploader
  if (media.isPublished === false) {
    return !!isStaff || isUploader;
  }

  // Private media only visible to staff or uploader
  if (media.visibility === MediaVisibility.PRIVATE) {
    return !!isStaff || isUploader;
  }

  return true;
}

export function canCreateMediaMetadata(
  role: RoleType,
  allowUserUploads = false
): boolean {
  if (role === ROLES.PLATFORM_ADMIN) return true;
  if (EVENT_ADMIN_ROLES.includes(role) || role === ROLES.SOCIAL_MEDIA_MEMBER) return true;
  if (role === ROLES.USER && allowUserUploads) return true;
  return false;
}

export function canUpdateMediaMetadata(
  media: { uploaderId: string },
  role: RoleType,
  userId: string
): boolean {
  if (role === ROLES.PLATFORM_ADMIN || EVENT_ADMIN_ROLES.includes(role)) return true;
  return media.uploaderId === userId;
}

export function canDeleteMedia(
  media: { uploaderId: string },
  role: RoleType,
  userId: string
): boolean {
  if (role === ROLES.PLATFORM_ADMIN || EVENT_ADMIN_ROLES.includes(role)) return true;
  return media.uploaderId === userId;
}

export interface OrganisationDownloadContext {
  allowOriginalDownloads?: boolean;
  allowVideoDownloads?: boolean;
  allowPhotoDownloads?: boolean;
  allowBulkDownloads?: boolean;
}

export interface EventDownloadContext extends EventAccessContext {
  allowDownloads: boolean;
  allowOriginalDownloads?: boolean;
  allowBulkDownloads?: boolean;
}

export interface MediaDownloadAccessContext extends MediaAccessContext {
  mediaType?: 'IMAGE' | 'VIDEO' | string;
}

/**
 * Evaluates whether a user is authorized to download media.
 */
export function canDownloadMedia(
  media: MediaDownloadAccessContext,
  event: EventDownloadContext,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  userId?: string | null,
  orgPolicy?: OrganisationDownloadContext
): boolean {
  // Platform admins can download any media
  if (userRole === ROLES.PLATFORM_ADMIN) return true;

  // Staff and the original uploader can always download their media
  const isStaff = userRole && MODERATOR_STAFF_ROLES.includes(userRole);
  const isUploader = !!userId && media.uploaderId === userId;
  if (isStaff || isUploader) {
    return true;
  }

  // Normal attendees must be able to view the media AND the event must have downloads enabled
  if (!canViewMedia(media, event, userRole, hasOrgAccess, userId)) {
    return false;
  }

  if (event.allowDownloads !== true) {
    return false;
  }

  // Organisation-level media type download policies
  if (orgPolicy) {
    if (media.mediaType === 'VIDEO' && orgPolicy.allowVideoDownloads === false) {
      return false;
    }
    if (media.mediaType === 'IMAGE' && orgPolicy.allowPhotoDownloads === false) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates whether a user is authorized to download original high-resolution master media.
 * Original master downloads are restricted to platform admin, organisation staff, or the original uploader,
 * or when explicitly permitted by organisation/event policy.
 */
export function canDownloadOriginal(
  media: MediaDownloadAccessContext,
  event: EventDownloadContext,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  userId?: string | null,
  allowOriginalOverride = false,
  orgPolicy?: OrganisationDownloadContext
): boolean {
  if (userRole === ROLES.PLATFORM_ADMIN) return true;

  const isStaff = userRole && MODERATOR_STAFF_ROLES.includes(userRole);
  const isUploader = !!userId && media.uploaderId === userId;
  if (isStaff || isUploader) {
    return true;
  }

  // If organisation/event policy allows global original download
  const isOriginalAllowed =
    allowOriginalOverride ||
    orgPolicy?.allowOriginalDownloads === true ||
    event.allowOriginalDownloads === true;

  if (isOriginalAllowed) {
    return canDownloadMedia(media, event, userRole, hasOrgAccess, userId, orgPolicy);
  }

  return false;
}

/**
 * Evaluates whether bulk export/download is permitted for the given context.
 */
export function canBulkDownload(
  event?: EventDownloadContext | null,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  orgPolicy?: OrganisationDownloadContext
): boolean {
  if (userRole === ROLES.PLATFORM_ADMIN) return true;

  const isStaff = userRole && MODERATOR_STAFF_ROLES.includes(userRole);
  if (isStaff) {
    return true;
  }

  if (orgPolicy && orgPolicy.allowBulkDownloads === false) {
    return false;
  }

  if (event) {
    if (event.allowDownloads === false || event.allowBulkDownloads === false) {
      return false;
    }
    if (!canViewEvent(event, userRole, hasOrgAccess)) {
      return false;
    }
  }

  return true;
}

