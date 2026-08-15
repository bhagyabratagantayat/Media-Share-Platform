import { describe, it, expect } from 'vitest';
import { normalizeSlug } from '../src/server/organisations/service';

describe('Organisation Slug Normalization', () => {
  it('should convert mixed-case strings to lowercase hyphens', () => {
    expect(normalizeSlug('Bhubaneswar Engineering College')).toBe('bhubaneswar-engineering-college');
  });

  it('should strip special characters and consecutive hyphens', () => {
    expect(normalizeSlug('BEC @ Bhubaneswar (2026)!!')).toBe('bec-bhubaneswar-2026');
    expect(normalizeSlug('---Leading---and---Trailing---')).toBe('leading-and-trailing');
  });

  it('should preserve alphanumeric slugs', () => {
    expect(normalizeSlug('tech-university-101')).toBe('tech-university-101');
  });
});
