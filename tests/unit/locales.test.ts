import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ERROR_CODES } from '@/shared/errors';
import { loadCatalog } from './i18n-harness';

const catalog = loadCatalog('fr');

describe('catalogue fr.yml (contracts/locales.md)', () => {
  it('aucune valeur vide', () => {
    for (const [key, value] of Object.entries(catalog)) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('une clé error.<CODE> pour chaque ErrorCode', () => {
    for (const code of ERROR_CODES) expect(catalog, code).toHaveProperty([`error.${code}`]);
  });

  it('les six codes photo et emplacement ont un message, tous distincts (SC-007)', () => {
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

  it('extName et extDescription existent (manifeste)', () => {
    expect(catalog).toHaveProperty('extName');
    expect(catalog).toHaveProperty('extDescription');
  });

  it('toute clé littérale passée à t() / getMessage() dans src/ existe', () => {
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
      }
    }
  });
});
