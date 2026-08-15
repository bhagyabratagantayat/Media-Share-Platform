export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ORGANISATION_OWNER: 'ORGANISATION_OWNER',
  ORGANISATION_ADMIN: 'ORGANISATION_ADMIN',
  SOCIAL_MEDIA_MANAGER: 'SOCIAL_MEDIA_MANAGER',
  SOCIAL_MEDIA_MEMBER: 'SOCIAL_MEDIA_MEMBER',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
} as const;

export type RoleType = (typeof ROLES)[keyof typeof ROLES];

/**
 * Numeric role hierarchy weights for permission elevation comparisons.
 */
export const ROLE_HIERARCHY_LEVELS: Record<RoleType, number> = {
  [ROLES.PLATFORM_ADMIN]: 100,
  [ROLES.ORGANISATION_OWNER]: 90,
  [ROLES.ORGANISATION_ADMIN]: 80,
  [ROLES.SOCIAL_MEDIA_MANAGER]: 60,
  [ROLES.MODERATOR]: 50,
  [ROLES.SOCIAL_MEDIA_MEMBER]: 40,
  [ROLES.USER]: 10,
};

/**
 * Checks if candidate role has at least the privilege level of required minimum role.
 */
export function hasMinimumRole(userRole: RoleType, requiredRole: RoleType): boolean {
  const userLevel = ROLE_HIERARCHY_LEVELS[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY_LEVELS[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}
