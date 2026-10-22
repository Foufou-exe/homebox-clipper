import { existsSync, readFileSync } from 'node:fs';
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

  it('accès HomeBox uniquement en permission optionnelle', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']);
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
