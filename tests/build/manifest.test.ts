import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Exécuté après `bun run build` (script `test:build`) — principe V. */
const path = resolve(__dirname, '../../.output/chrome-mv3/manifest.json');

describe('manifest de production', () => {
  it('existe (lancer `bun run build` avant)', () => {
    expect(existsSync(path)).toBe(true);
  });

  const manifest = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
    : {};

  it('ne demande que storage, activeTab et scripting', () => {
    expect(new Set(manifest.permissions as string[])).toEqual(new Set(['storage', 'activeTab', 'scripting']));
  });

  it("n'a ni host_permissions ni content_scripts statiques", () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('accès HomeBox uniquement en permission optionnelle (origine exacte accordée à l’exécution)', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  });

  it("info-bulle de l'icône : nom affiché de l'extension", () => {
    expect((manifest.action as { default_title?: string }).default_title).toBe('HomeBox Clipper');
  });

  it('un seul build : nom issu du catalogue, sans suffixe de mode', () => {
    expect(manifest.name).toBe('__MSG_extName__');
    expect(manifest.description).toBe('__MSG_extDescription__');
  });

  // Étape B : l'anglais est la langue par défaut ; le français est servi par _locales/fr.
  it('langue par défaut en, avec les dossiers de locale en et fr', () => {
    expect(manifest.default_locale).toBe('en');
    const locales = resolve(path, '../_locales');
    expect(readdirSync(locales).sort()).toEqual(['en', 'fr']);
    for (const lang of ['en', 'fr']) {
      const messages = JSON.parse(readFileSync(resolve(locales, `${lang}/messages.json`), 'utf8')) as Record<string, unknown>;
      expect(messages, lang).toHaveProperty('extName');
      expect(messages, lang).toHaveProperty('extDescription');
    }
  });

  it("CSP sans unsafe-eval ni source distante", () => {
    const csp = JSON.stringify(manifest.content_security_policy ?? '');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('aucun fichier du build ne contient de code distant', () => {
    const background = readFileSync(resolve(path, '../background.js'), 'utf8');
    expect(background).not.toMatch(/\beval\(|new Function\(/);
  });
});
