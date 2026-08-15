import { describe, it, expect } from 'vitest';
import { assertTenantOwnership } from '../src/server/permissions/guards';
import { ForbiddenError } from '../src/lib/errors';

describe('Tenant Isolation Guards', () => {
  it('should pass when resource organisationId matches active organisation context', () => {
    const orgId = 'org-tenant-alpha-123';
    expect(() => assertTenantOwnership(orgId, orgId, 'Event')).not.toThrow();
  });

  it('should throw ForbiddenError (403) when cross-tenant access is attempted', () => {
    const orgAId = 'org-tenant-alpha-123';
    const orgBId = 'org-tenant-beta-456';

    expect(() => assertTenantOwnership(orgAId, orgBId, 'Private Media')).toThrow(ForbiddenError);
    expect(() => assertTenantOwnership(orgAId, orgBId, 'Private Media')).toThrow(
      /Cross-tenant access violation/
    );
  });
});
