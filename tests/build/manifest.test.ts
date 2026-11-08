import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Runs after `bun run build` (`test:build` script) — principle V. */
const path = resolve(__dirname, '../../.output/chrome-mv3/manifest.json');

describe('production manifest', () => {
  it('exists (run `bun run build` first)', () => {
    expect(existsSync(path)).toBe(true);
  });

  const manifest = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
    : {};

  it('only requests storage, activeTab and scripting', () => {
    expect(new Set(manifest.permissions as string[])).toEqual(new Set(['storage', 'activeTab', 'scripting']));
  });

  it("has no static host_permissions or content_scripts", () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('HomeBox access only as an optional permission (exact origin granted at runtime)', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  });

  it("icon tooltip: displayed name of the extension", () => {
    expect((manifest.action as { default_title?: string }).default_title).toBe('HomeBox Clipper');
  });

  it('a single build: name from the catalog, no mode suffix', () => {
    expect(manifest.name).toBe('__MSG_extName__');
    expect(manifest.description).toBe('__MSG_extDescription__');
  });

  // Step B: English is the default language; French is served from _locales/fr.
  it('default language en, with both the en and fr locale folders', () => {
    expect(manifest.default_locale).toBe('en');
    const locales = resolve(path, '../_locales');
    expect(readdirSync(locales).sort()).toEqual(['en', 'fr']);
    for (const lang of ['en', 'fr']) {
      const messages = JSON.parse(readFileSync(resolve(locales, `${lang}/messages.json`), 'utf8')) as Record<string, unknown>;
      expect(messages, lang).toHaveProperty('extName');
      expect(messages, lang).toHaveProperty('extDescription');
    }
  });

  it("CSP without unsafe-eval or remote source", () => {
    const csp = JSON.stringify(manifest.content_security_policy ?? '');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('no build file contains remote code', () => {
    const background = readFileSync(resolve(path, '../background.js'), 'utf8');
    expect(background).not.toMatch(/\beval\(|new Function\(/);
  });
});
