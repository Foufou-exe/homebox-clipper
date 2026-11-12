import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES = join(__dirname, '..', 'fixtures', 'config');
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'check-config.ts');

function run(name: string): { code: number; output: string } {
  return runAt(join(FIXTURES, name));
}

function runAt(root: string): { code: number; output: string } {
  try {
    const out = execFileSync('bun', [SCRIPT, '--root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe('scripts/check-config.ts', () => {
  it('accepte un dépôt valide (JSONC avec commentaires)', () => {
    expect(run('valid').code).toBe(0);
  });

  it.each([
    ['broken-json', '.vscode/settings.json'],
    ['broken-yaml', 'src/locales/fr.yml'],
    ['bun-mismatch', 'package.json'],
    ['label-missing', '.github/ISSUE_TEMPLATE/bug.yml'],
    ['required-missing', '.github/ISSUE_TEMPLATE/bug.yml'],
    ['schema-invalid', '.github/ISSUE_TEMPLATE/bug.yml'],
    ['privacy-missing', '.github/ISSUE_TEMPLATE/feature.yml'],
    ['discussion-invalid', '.github/DISCUSSION_TEMPLATE/ideas.yml'],
    ['locale-keys', 'src/locales/en.yml'],
    ['locale-subs', 'src/locales/en.yml'],
  ])('refuse %s en citant %s', (name, file) => {
    const r = run(name);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain(file);
  });

  describe('copie temporaire de la fixture valid', () => {
    const dirs: string[] = [];
    const copyValid = (): string => {
      const dir = mkdtempSync(join(tmpdir(), 'check-config-'));
      dirs.push(dir);
      cpSync(join(FIXTURES, 'valid'), dir, { recursive: true });
      return dir;
    };
    afterAll(() => {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    });

    it.each([
      ['mise.toml normal', '[tools]\nbun = "1.4"\n', 0],
      ['mise.toml indenté', '[tools]\n  \tbun  =  "1.4"\n', 0],
      ['mise.toml sans version bun', '[tools]\nnode = "lts"\n', 1],
      ['mise.toml version différente', '[tools]\nbun = "1.3"\n', 1],
    ])('%s', (_name, content, code) => {
      const dir = copyValid();
      writeFileSync(join(dir, 'mise.toml'), content);
      expect(runAt(dir).code).toBe(code);
    });

    it('mise.toml pathologique (50 000 lignes vides) : analysé vite', () => {
      const dir = copyValid();
      writeFileSync(join(dir, 'mise.toml'), `${'\n'.repeat(50_000)}bun = "1.4"\n`);
      const t0 = performance.now();
      const r = runAt(dir);
      const ms = performance.now() - t0;
      expect(r.code).toBe(0);
      expect(ms).toBeLessThan(3000); // démarrage de Bun inclus
    });

    it('mise.toml pathologique sans correspondance : refusé vite', () => {
      const dir = copyValid();
      writeFileSync(join(dir, 'mise.toml'), `${' \n'.repeat(50_000)}bun`);
      const t0 = performance.now();
      const r = runAt(dir);
      const ms = performance.now() - t0;
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('mise.toml');
      expect(ms).toBeLessThan(3000);
    });

    it('refuse une valeur de traduction non scalaire en citant la clé', () => {
      const dir = copyValid();
      writeFileSync(join(dir, 'src/locales/en.yml'), 'app:\n  items:\n    - a\n    - b\n');
      const r = runAt(dir);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('app.items');
      expect(r.output).not.toContain('[object Object]');
    });

    it('accepte les valeurs scalaires et nulles (comportement inchangé)', () => {
      const dir = copyValid();
      writeFileSync(join(dir, 'src/locales/en.yml'), 'app:\n  a: 1\n  b: true\n  c:\n');
      writeFileSync(join(dir, 'src/locales/fr.yml'), 'app:\n  a: 1\n  b: true\n  c:\n');
      expect(runAt(dir).code).toBe(0);
    });
  });
});
