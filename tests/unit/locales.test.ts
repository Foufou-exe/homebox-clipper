import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '@/shared/errors';
import { IDENTICAL_OK, loadCatalog } from './i18n-harness';

const catalog = loadCatalog('fr');
const en = loadCatalog('en');

const subs = (v: string) => [...new Set(v.match(/\$[1-9]/g) ?? [])].sort();

describe('en.yml / fr.yml catalog parity (step B)', () => {
  it('same set of keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(catalog).sort());
  });

  it('same set of $n substitutions for each key', () => {
    for (const key of Object.keys(catalog)) expect(subs(en[key] ?? ''), key).toEqual(subs(catalog[key]!));
  });

  it('no empty value or identical text outside IDENTICAL_OK', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), key).not.toBe('');
      if (!IDENTICAL_OK.includes(key)) expect(value, `${key} identical to fr`).not.toBe(catalog[key]);
    }
  });

  it('each IDENTICAL_OK entry exists and is indeed identical (up-to-date list)', () => {
    for (const key of IDENTICAL_OK) {
      expect(en, key).toHaveProperty([key]);
      expect(en[key], key).toBe(catalog[key]);
    }
  });

  it('no accented character in en.yml', () => {
    for (const [key, value] of Object.entries(en)) expect(value, key).not.toMatch(/[À-ÖØ-öø-ÿ]/);
  });

  it('HomeBox note: the English summary.orderNote contains $1 (order number)', () => {
    expect(en['summary.orderNote']).toBe('Amazon.fr order: $1');
  });
});

describe('catalogue fr.yml (contracts/locales.md)', () => {
  it('no empty value', () => {
    for (const [key, value] of Object.entries(catalog)) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('an error.<CODE> key for each ErrorCode', () => {
    for (const code of ERROR_CODES) expect(catalog, code).toHaveProperty([`error.${code}`]);
  });

  it('the six photo and location codes have a message, all distinct (SC-007)', () => {
    const codes = [
      'PHOTO_UNAVAILABLE',
      'PHOTO_NOT_IMAGE',
      'PHOTO_TOO_LARGE',
      'PHOTO_UPLOAD_FAILED',
      'LOCATIONS_UNAVAILABLE',
      'LOCATION_NOT_FOUND',
    ];
    const messages = codes.map((code) => {
      expect(ERROR_CODES, code).toContain(code);
      expect(catalog, code).toHaveProperty([`error.${code}`]);
      return catalog[`error.${code}`];
    });
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('extName and extDescription exist (manifest)', () => {
    expect(catalog).toHaveProperty('extName');
    expect(catalog).toHaveProperty('extDescription');
  });

  it('every literal key passed to t() / getMessage() in src/ exists', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue)$/.test(name)) files.push(path);
      }
    };
    walk(resolve(__dirname, '../../src'));
    const call = /\b(?:t|getMessage)\(\s*(['"`])([\w.]+)\1/g;
    for (const file of files) {
      for (const [, , key] of readFileSync(file, 'utf8').matchAll(call)) {
        expect(catalog, `${file} : ${key}`).toHaveProperty([key!]);
        expect(en, `en : ${file} : ${key}`).toHaveProperty([key!]);
      }
    }
  });
});

describe('project links keys (004, FR-009, FR-010, SC-005)', () => {
  const keys = ['links.support', 'links.github', 'links.supportAria', 'links.githubAria', 'options.helpTitle', 'options.helpIntro'];

  it.each(keys)('%s exists in en.yml and fr.yml', (key) => {
    expect(en).toHaveProperty([key]);
    expect(catalog).toHaveProperty([key]);
  });

  it.each([
    ['en', en, 'new tab'],
    ['fr', catalog, 'nouvel onglet'],
  ] as const)('%s: accessible names start with the visible label and mention the new tab (WCAG 2.5.3)', (_l, cat, tab) => {
    expect(cat['links.supportAria']!.startsWith(cat['links.support']!)).toBe(true);
    expect(cat['links.githubAria']!.startsWith(cat['links.github']!)).toBe(true);
    expect(cat['links.supportAria']).toContain(tab);
    expect(cat['links.githubAria']).toContain(tab);
  });
});
