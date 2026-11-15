import { reconcileWarranty } from '@/shared/warranty';
import type { WarrantyDraft } from '@/shared/types';

const w = (over: Partial<WarrantyDraft> = {}): WarrantyDraft => ({
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'x',
  durationMonths: 24,
  edited: false,
  ...over,
});

describe('reconcileWarranty (011, Q-U5, FR-005, US1-4)', () => {
  it('edited: the same reference, whatever the date', () => {
    const edited = w({ edited: true });
    expect(reconcileWarranty(edited, '2027-01-15')).toBe(edited);
    expect(reconcileWarranty(edited, null)).toBe(edited);
  });

  it('lifetime: the same reference', () => {
    const life = w({ lifetime: true, expires: null });
    expect(reconcileWarranty(life, '2027-01-15')).toBe(life);
  });

  it('not edited: expiry recomputed from the new purchase date', () => {
    expect(reconcileWarranty(w(), '2027-01-15').expires).toBe('2029-01-15');
  });

  it.each([null, '', '2026-02-30'])('purchase date %j: expiry null, duration kept', (date) => {
    const r = reconcileWarranty(w(), date);
    expect(r.expires).toBeNull();
    expect(r.durationMonths).toBe(24);
  });

  it('unknown duration: expiry unchanged', () => {
    expect(reconcileWarranty(w({ durationMonths: null, expires: '2030-05-05' }), '2027-01-15').expires).toBe('2030-05-05');
  });

  it('date erased then typed again: recomputed', () => {
    const erased = reconcileWarranty(w(), null);
    expect(reconcileWarranty(erased, '2026-11-03').expires).toBe('2028-11-03');
  });

  it('no date at first, then entered: expiry computed', () => {
    expect(reconcileWarranty(w({ expires: null }), '2026-11-03').expires).toBe('2028-11-03');
  });

  it('the input is never mutated', () => {
    const input = w();
    const copy = { ...input };
    const out = reconcileWarranty(input, '2027-01-15');
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });
});
