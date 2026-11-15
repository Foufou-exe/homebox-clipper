import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanLabel, combineWarranties, parseWarrantyText } from '@/content/merchants/warranty-text';
import type { PageWarranty } from '@/shared/types';

describe('parseWarrantyText: recognized formats (011, Q-U7, FR-004, FR-011)', () => {
  it.each([
    ['garantie 3 ans', 36],
    ['3 ans de garantie', 36],
    ['garantie 24 mois', 24],
    ['Garantie 3 Ans', 36],
    ['5 years warranty', 60],
    ['warranty: 5 years', 60],
    ['3 Jahre Garantie', 36],
    ['garantía de 2 años', 24],
    ['garanzia 3 anni', 36],
    ['3 jaar garantie', 36],
  ])('%s → %i months', (text, months) => {
    const w = parseWarrantyText(text);
    expect(w).toMatchObject({ months, lifetime: false });
    expect(w?.label.length).toBeGreaterThan(0);
  });

  it.each(['garantie à vie', 'garantie illimitée', 'lifetime warranty', 'Garantie À Vie 10 ans exclus'])(
    'lifetime: %s',
    (text) => {
      const w = parseWarrantyText(text);
      expect(w).toMatchObject({ months: null, lifetime: true });
      expect(w?.label.length).toBeGreaterThan(0);
    },
  );
});

describe('parseWarrantyText: bounds and refusals (011, spec edge cases)', () => {
  it('120 months ("10 ans") is accepted; 121 months and 15 years are not', () => {
    expect(parseWarrantyText('garantie 10 ans')?.months).toBe(120);
    expect(parseWarrantyText('garantie 120 mois')?.months).toBe(120);
    expect(parseWarrantyText('garantie 121 mois')).toBeNull();
    expect(parseWarrantyText('garantie 15 ans')).toBeNull();
  });

  it.each(['garantie 0 an', 'garantie -3 ans', 'garantie 1,5 an', 'garantie 0 mois'])('%s → null', (text) => {
    expect(parseWarrantyText(text)).toBeNull();
  });

  it.each([
    'satisfait ou remboursé',
    'Satisfait ou remboursé 30 jours',
    '30 jours',
    "jusqu'à",
    'garantie',
    'garantie 2 ans puis garantie 3 ans',
    '',
  ])('not recognized: %j → null', (text) => {
    expect(parseWarrantyText(text)).toBeNull();
  });

  it('the label is the cleaned text', () => {
    expect(parseWarrantyText('  Garantie   3 ans ')?.label).toBe('Garantie 3 ans');
  });
});

describe('combineWarranties: extension (011, FR-004)', () => {
  const w = (months: number, label: string): PageWarranty => ({ months, lifetime: false, label });

  it('base 24 + extension 36 = 60 months, the label keeps "extension"', () => {
    const r = combineWarranties(w(24, 'Garantie 2 ans'), w(36, 'Extension de garantie 3 ans'));
    expect(r?.months).toBe(60);
    expect(r?.lifetime).toBe(false);
    expect(r?.label.toLowerCase()).toContain('extension');
    expect(r!.label.length).toBeLessThanOrEqual(200);
  });

  it('an extension without a base is not used', () => {
    expect(combineWarranties(null, w(36, 'Extension de garantie 3 ans'))).toBeNull();
  });

  it('a base alone is not combined', () => {
    expect(combineWarranties(w(24, 'Garantie 2 ans'), null)).toBeNull();
  });

  it('a total above 120 months is not used', () => {
    expect(combineWarranties(w(96, 'Garantie 8 ans'), w(36, 'Extension 3 ans'))).toBeNull();
    expect(combineWarranties(w(60, 'a'), w(60, 'Extension b'))?.months).toBe(120);
  });
});

describe('cleanLabel (011, R12)', () => {
  it('collapses spaces and drops control characters', () => {
    expect(cleanLabel('  Garantie \t\n  3\u0000 ans\u0007 ')).toBe('Garantie 3 ans');
  });

  it('cut to 200 characters', () => {
    expect(cleanLabel('a'.repeat(500))).toHaveLength(200);
  });

  it('never cuts a surrogate pair in half', () => {
    const out = cleanLabel('a'.repeat(199) + '😀' + 'b')!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toBe('a'.repeat(199));
    expect(cleanLabel('a'.repeat(198) + '😀')).toBe('a'.repeat(198) + '😀');
  });

  it.each(['', '   ', '\u0000\u0001'])('empty label %j is refused', (text) => {
    expect(cleanLabel(text)).toBeNull();
  });

  it('never keeps HTML', () => {
    expect(cleanLabel('<b>Garantie</b> 3 ans')).toBe('Garantie 3 ans');
    expect(cleanLabel('<script>alert(1)</script>Garantie')).not.toContain('<');
  });
});

describe('warranty-text.ts: pure module (011)', () => {
  it('no DOM, network, browser API or console', () => {
    const source = readFileSync(resolve(__dirname, '../../src/content/merchants/warranty-text.ts'), 'utf8');
    expect(source).not.toMatch(/\b(document|window|fetch|localStorage|chrome|browser|console)\b\s*[.(]/);
    expect(source).not.toMatch(/from ['"]@\/platform/);
  });
});
