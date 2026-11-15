import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addMonths, isValidIsoDate } from '@/shared/warranty';

describe('isValidIsoDate (011, Q-U1)', () => {
  it.each(['2026-11-03', '2028-02-29', '1900-01-01', '2200-12-31', '2026-12-31'])('%s is valid', (v) => {
    expect(isValidIsoDate(v)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '03/11/2026',
    '2026-1-5',
    '',
    null,
    undefined,
    42,
    '1899-12-31',
    '2201-01-01',
    '2026-00-10',
    '2026-11-00',
  ])('%j is invalid', (v) => {
    expect(isValidIsoDate(v)).toBe(false);
  });
});

describe('addMonths: calendar arithmetic without time zone (011, Q-U2, FR-005, SC-002)', () => {
  it.each([
    ['2026-11-03', 24, '2028-11-03'],
    ['2028-02-29', 24, '2030-02-28'],
    ['2028-02-29', 48, '2032-02-29'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2027-01-31', 1, '2027-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-11-03', 36, '2029-11-03'],
    ['2026-11-03', 6, '2027-05-03'],
    ['2026-11-03', 1200, '2126-11-03'],
    ['2026-11-03', 1201, null],
    ['2199-11-03', 24, null],
    ['1900-01-01', 1, '1900-02-01'],
    ['2200-12-31', 1, null],
  ])('addMonths(%s, %i) = %s', (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });

  it.each([null, '', '2026-02-30', '03/11/2026', '2026-13-01'])('absent or invalid date %j: nothing is invented', (d) => {
    expect(addMonths(d, 24)).toBeNull();
  });

  it.each([0, -1, 1.5, NaN, Infinity, '24'])('invalid duration %j: null, no exception', (m) => {
    expect(() => addMonths('2026-11-03', m as number)).not.toThrow();
    expect(addMonths('2026-11-03', m as number)).toBeNull();
  });
});

describe('src/shared/warranty.ts: source constraints (011, FR-011)', () => {
  const source = readFileSync(resolve(__dirname, '../../src/shared/warranty.ts'), 'utf8');

  it('no string-based Date parsing, no local-time getters, no toISOString', () => {
    expect(source).not.toMatch(/new Date\(\s*['"`a-zA-Z]/);
    expect(source).not.toMatch(/getFullYear|setFullYear|toISOString/);
  });

  it('imports nothing from ui/, content/ or background/ (except types) and uses no browser API', () => {
    const imports = source.match(/^import\s.*$/gm) ?? [];
    for (const line of imports) {
      expect(line).toMatch(/^import type /);
      expect(line).not.toMatch(/@\/ui\/|@\/content\//);
    }
    expect(source).not.toMatch(/\b(document|window|fetch|localStorage|chrome|browser|console)\b\s*[.(]/);
  });
});
