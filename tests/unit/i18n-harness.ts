import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Catalogues aplatis : { fr: { 'error.UNAUTHORIZED': '…' } }. */
export type Catalogs = Record<string, Record<string, string>>;

const root = resolve(__dirname, '../..');
let cache: Catalogs | undefined;

/**
 * Loads src/locales/*.yml. Vitest runs under Node (no `Bun.YAML`): the YAML is read by
 * `scripts/dump-locales.ts` in a Bun subprocess, once per test file.
 */
export function loadCatalog(lang: string): Record<string, string> {
  cache ??= JSON.parse(
    execFileSync('bun', ['scripts/dump-locales.ts'], { cwd: root, encoding: 'utf8' }),
  ) as Catalogs;
  const catalog = cache[lang];
  if (!catalog) throw new Error(`Catalogue absent : ${lang}`);
  return catalog;
}

/** Simulates `getMessage`: dotted key, `$1…$9` substitutions, `$$` for a dollar sign. */
export function makeGetMessage(catalog: Record<string, string>) {
  return (key: string, substitutions?: string | string[]): string => {
    const raw = catalog[key];
    if (raw === undefined) throw new Error(`Key missing from the catalog: ${key}`);
    const subs = substitutions === undefined ? [] : [substitutions].flat();
    return raw.replace(/\$(\$|[1-9])/g, (_, g: string) => (g === '$' ? '$' : (subs[Number(g) - 1] ?? '')));
  };
}

/**
 * Simulated interface language (`fr` by default, like the setup-i18n.ts mock). Stored on
 * `globalThis`: the setup file and the test file may not share this module.
 * `setup-i18n.ts` resets it to `fr` before each test.
 */
const LANG_KEY = '__TEST_UI_LANGUAGE__';
export function setTestLanguage(lang: 'en' | 'fr'): void {
  (globalThis as Record<string, unknown>)[LANG_KEY] = lang;
}
export function testLanguage(): 'en' | 'fr' {
  return ((globalThis as Record<string, unknown>)[LANG_KEY] as 'en' | 'fr' | undefined) ?? 'fr';
}

/**
 * Values deliberately identical in `en` and `fr` (contracts/locales.md, test 8). A key outside the
 * list whose two values are identical fails the test; so does an entry whose values have
 * diverged (the list is kept up to date).
 */
export const IDENTICAL_OK = [
  'extName', // nom propre
  'header.brand', // nom propre
  'header.clipper', // nom propre
  'popup.pageTitle', // nom propre
  'location.pathSeparator', // symbole
  'fields.description', // same word in both languages
  'links.support', // same word in both languages
  'links.github', // nom propre
];

