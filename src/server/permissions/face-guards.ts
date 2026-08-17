import { Role, ROLES } from './roles';

/**
 * Validates if a user role can modify organisation-wide face discovery settings or toggle event face indexing.
 */
export function canManageFaceDiscovery(role: Role): boolean {
  return (
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.ORGANISATION_OWNER ||
    role === ROLES.ORGANISATION_ADMIN
  );
}

/**
 * Validates if a user can view organisation face discovery analytics and queue statistics.
 */
export function canViewFaceAdminStats(role: Role): boolean {
  return (
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.ORGANISATION_OWNER ||
    role === ROLES.ORGANISATION_ADMIN
  );
}

/**
 * Validates if a user can perform photo discovery for their own profile.
 * Normal users can search their own face if consent and profile are active.
 */
export function canSearchOwnPhotos(
  role: Role,
  hasActiveConsent: boolean,
  isProfileActive: boolean,
  isFeatureEnabled: boolean
): boolean {
  return isFeatureEnabled && hasActiveConsent && isProfileActive;
}
