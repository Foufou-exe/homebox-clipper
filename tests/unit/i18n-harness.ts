import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Catalogues aplatis : { fr: { 'error.UNAUTHORIZED': '…' } }. */
export type Catalogs = Record<string, Record<string, string>>;

const root = resolve(__dirname, '../..');
let cache: Catalogs | undefined;

/**
 * Charge src/locales/*.yml. Vitest tourne sous Node (pas de `Bun.YAML`) : le YAML est lu par
 * `scripts/dump-locales.ts` en sous-processus Bun, une fois par fichier de test.
 */
export function loadCatalog(lang: string): Record<string, string> {
  cache ??= JSON.parse(
    execFileSync('bun', ['scripts/dump-locales.ts'], { cwd: root, encoding: 'utf8' }),
  ) as Catalogs;
  const catalog = cache[lang];
  if (!catalog) throw new Error(`Catalogue absent : ${lang}`);
  return catalog;
}

/** Simule `getMessage` : clé pointée, substitutions `$1…$9`, `$$` pour un dollar. */
export function makeGetMessage(catalog: Record<string, string>) {
  return (key: string, substitutions?: string | string[]): string => {
    const raw = catalog[key];
    if (raw === undefined) throw new Error(`Clé absente du catalogue : ${key}`);
    const subs = substitutions === undefined ? [] : [substitutions].flat();
    return raw.replace(/\$(\$|[1-9])/g, (_, g: string) => (g === '$' ? '$' : (subs[Number(g) - 1] ?? '')));
  };
}

/**
 * Langue simulée de l'interface (`fr` par défaut, comme le mock de setup-i18n.ts). Stockée sur
 * `globalThis` : le fichier de setup et le fichier de test peuvent ne pas partager ce module.
 * `setup-i18n.ts` la remet à `fr` avant chaque test.
 */
const LANG_KEY = '__TEST_UI_LANGUAGE__';
export function setTestLanguage(lang: 'en' | 'fr'): void {
  (globalThis as Record<string, unknown>)[LANG_KEY] = lang;
}
export function testLanguage(): 'en' | 'fr' {
  return ((globalThis as Record<string, unknown>)[LANG_KEY] as 'en' | 'fr' | undefined) ?? 'fr';
}

/**
 * Valeurs volontairement identiques en `en` et en `fr` (contracts/locales.md, test 8). Une clé hors
 * liste dont les deux valeurs sont identiques fait échouer le test ; une entrée dont les valeurs ont
 * divergé aussi (liste tenue à jour).
 */
export const IDENTICAL_OK = [
  'extName', // nom propre
  'header.brand', // nom propre
  'header.clipper', // nom propre
  'popup.pageTitle', // nom propre
  'location.pathSeparator', // symbole
  'fields.description', // même mot dans les deux langues
];

