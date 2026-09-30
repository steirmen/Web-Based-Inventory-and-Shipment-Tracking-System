import { describe, expect, it } from 'vitest';
import { slugify, validateSlug } from './organization-form';

describe('slugify', () => {
  it.each([
    ['Demo Trading Co.', 'demo-trading-co'],
    ['  Şirin Café & Çay  ', 'sirin-cafe-cay'],
    ['Işık Elektronik', 'isik-elektronik'],
    ['---', ''],
    ['A'.repeat(80), 'a'.repeat(50)],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('validateSlug', () => {
  it.each(['acme', 'acme-supplies-2'])('accepts %j', (slug) => {
    expect(validateSlug(slug)).toBeUndefined();
  });

  it.each(['', 'ab', 'Acme', 'acme--co', '-acme', 'acme_co'])('rejects %j', (slug) => {
    expect(validateSlug(slug)).toBeDefined();
  });
});
