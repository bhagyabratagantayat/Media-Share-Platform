import { VariantType } from '@prisma/client';

/**
 * Deterministic storage key generator for multi-tenant media assets.
 * Key formats:
 *   Original: organisations/:organisationId/events/:eventId/media/:mediaId/original
 *   Variant:  organisations/:organisationId/events/:eventId/media/:mediaId/variants/:variantType
 */
export function buildOriginalMediaStorageKey(
  organisationId: string,
  eventId: string,
  mediaId: string
): string {
  return `organisations/${organisationId}/events/${eventId}/media/${mediaId}/original`;
}

export function buildMediaVariantStorageKey(
  organisationId: string,
  eventId: string,
  mediaId: string,
  variantType: VariantType
): string {
  const variantSlug = variantType.toLowerCase();
  return `organisations/${organisationId}/events/${eventId}/media/${mediaId}/variants/${variantSlug}`;
}

export function parseMediaStorageKey(storageKey: string): {
  organisationId?: string;
  eventId?: string;
  mediaId?: string;
  isVariant: boolean;
  variantType?: string;
} {
  const parts = storageKey.split('/');
  if (parts[0] !== 'organisations' || parts[2] !== 'events' || parts[4] !== 'media') {
    return { isVariant: false };
  }

  const organisationId = parts[1];
  const eventId = parts[3];
  const mediaId = parts[5];
  const isVariant = parts[6] === 'variants';
  const variantType = isVariant ? parts[7] : undefined;

  return {
    organisationId,
    eventId,
    mediaId,
    isVariant,
    variantType,
  };
}
