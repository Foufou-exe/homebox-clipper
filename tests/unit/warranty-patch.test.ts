import { warrantyPatch } from '@/shared/warranty';
import type { WarrantyDraft } from '@/shared/types';

const w = (over: Partial<WarrantyDraft> = {}): WarrantyDraft => ({
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'Garantie légale de conformité (2 ans)',
  durationMonths: 24,
  edited: false,
  ...over,
});

describe('warrantyPatch (011, FR-006, FR-008, R10, V-2)', () => {
  it('absent or null: nothing', () => {
    expect(warrantyPatch(null, {})).toEqual({});
    expect(warrantyPatch(undefined, {})).toEqual({});
  });

  it('full legal warranty: date and details, never lifetimeWarranty', () => {
    expect(warrantyPatch(w(), {})).toEqual({
      warrantyExpires: '2028-11-03',
      warrantyDetails: 'Garantie légale de conformité (2 ans)',
    });
  });

  it('lifetime: lifetimeWarranty true and never a date, even when one is stored', () => {
    const patch = warrantyPatch(w({ lifetime: true, expires: '2028-11-03', details: '' }), { lifetimeWarranty: false });
    expect(patch).toEqual({ lifetimeWarranty: true });
    expect(patch).not.toHaveProperty('warrantyExpires');
  });

  it.each(['2026-02-30', null, ''])('invalid or absent date %j: no date key', (expires) => {
    expect(warrantyPatch(w({ expires, details: '' }), {})).toEqual({});
  });

  it('details are trimmed', () => {
    expect(warrantyPatch(w({ expires: null, details: '  x  ' }), {})).toEqual({ warrantyDetails: 'x' });
  });

  it('details of 1000 characters are sent, 1001 are not', () => {
    expect(warrantyPatch(w({ expires: null, details: 'a'.repeat(1000) }), {})).toEqual({ warrantyDetails: 'a'.repeat(1000) });
    expect(warrantyPatch(w({ expires: null, details: 'a'.repeat(1001) }), {})).toEqual({});
  });

  it.each(['', '   '])('empty details %j: not sent', (details) => {
    expect(warrantyPatch(w({ expires: null, details }), {})).toEqual({});
  });

  it('never sends lifetimeWarranty false', () => {
    expect(warrantyPatch(w(), {})).not.toHaveProperty('lifetimeWarranty');
  });

  it('no overwrite: an existing date, details or lifetime flag is left alone', () => {
    expect(warrantyPatch(w(), { warrantyExpires: '2030-01-01' })).toEqual({
      warrantyDetails: 'Garantie légale de conformité (2 ans)',
    });
    expect(warrantyPatch(w(), { warrantyDetails: 'x' })).toEqual({ warrantyExpires: '2028-11-03' });
    expect(warrantyPatch(w({ lifetime: true }), { lifetimeWarranty: true })).toEqual({
      warrantyDetails: 'Garantie légale de conformité (2 ans)',
    });
  });

  it.each([undefined, null, '', '0001-01-01'])('HomeBox empty value %j: sending is allowed', (empty) => {
    const existing = { warrantyExpires: empty, warrantyDetails: empty } as unknown as Parameters<typeof warrantyPatch>[1];
    expect(warrantyPatch(w(), existing)).toEqual({
      warrantyExpires: '2028-11-03',
      warrantyDetails: 'Garantie légale de conformité (2 ans)',
    });
  });

  it('a warranty without date, lifetime or details: nothing', () => {
    expect(warrantyPatch(w({ expires: null, details: '' }), {})).toEqual({});
  });
});
