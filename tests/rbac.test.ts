import { describe, it, expect } from 'vitest';
import { ROLES, hasMinimumRole } from '../src/server/permissions/roles';
import { PERMISSIONS, checkRolePermission } from '../src/server/permissions/permissions';

describe('RBAC Roles & Permissions Matrix', () => {
  it('should enforce role hierarchy correctly', () => {
    // Owner is higher than Admin, Member, User
    expect(hasMinimumRole(ROLES.ORGANISATION_OWNER, ROLES.ORGANISATION_ADMIN)).toBe(true);
    expect(hasMinimumRole(ROLES.ORGANISATION_OWNER, ROLES.USER)).toBe(true);

    // Regular User is NOT higher than Admin or Owner
    expect(hasMinimumRole(ROLES.USER, ROLES.ORGANISATION_ADMIN)).toBe(false);
    expect(hasMinimumRole(ROLES.USER, ROLES.ORGANISATION_OWNER)).toBe(false);

    // Social Media Member cannot perform Owner level tasks
    expect(hasMinimumRole(ROLES.SOCIAL_MEDIA_MEMBER, ROLES.ORGANISATION_OWNER)).toBe(false);
  });

  it('should allow Platform Admin and Owner to manage team and access settings', () => {
    expect(checkRolePermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.TEAM_MANAGE)).toBe(true);
    expect(checkRolePermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.ORG_ACCESS_MANAGE)).toBe(true);

    expect(checkRolePermission(ROLES.ORGANISATION_OWNER, PERMISSIONS.TEAM_MANAGE)).toBe(true);
    expect(checkRolePermission(ROLES.ORGANISATION_OWNER, PERMISSIONS.ORG_ACCESS_MANAGE)).toBe(true);
    expect(checkRolePermission(ROLES.ORGANISATION_OWNER, PERMISSIONS.ORG_DELETE)).toBe(true);
  });

  it('should deny regular User and Social Media Member from managing org access passwords or deleting org', () => {
    expect(checkRolePermission(ROLES.USER, PERMISSIONS.ORG_ACCESS_MANAGE)).toBe(false);
    expect(checkRolePermission(ROLES.USER, PERMISSIONS.ORG_DELETE)).toBe(false);
    expect(checkRolePermission(ROLES.USER, PERMISSIONS.TEAM_MANAGE)).toBe(false);
    expect(checkRolePermission(ROLES.USER, PERMISSIONS.MEDIA_MODERATE)).toBe(false);

    expect(checkRolePermission(ROLES.SOCIAL_MEDIA_MEMBER, PERMISSIONS.ORG_ACCESS_MANAGE)).toBe(false);
    expect(checkRolePermission(ROLES.SOCIAL_MEDIA_MEMBER, PERMISSIONS.ORG_DELETE)).toBe(false);
    expect(checkRolePermission(ROLES.SOCIAL_MEDIA_MEMBER, PERMISSIONS.TEAM_MANAGE)).toBe(false);
  });

  it('should allow Social Media Member and Manager to perform official media uploads', () => {
    expect(checkRolePermission(ROLES.SOCIAL_MEDIA_MEMBER, PERMISSIONS.MEDIA_UPLOAD_OFFICIAL)).toBe(true);
    expect(checkRolePermission(ROLES.SOCIAL_MEDIA_MANAGER, PERMISSIONS.MEDIA_UPLOAD_OFFICIAL)).toBe(true);
  });
});
