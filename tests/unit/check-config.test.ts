import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES = join(__dirname, '..', 'fixtures', 'config');
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'check-config.ts');

function run(name: string): { code: number; output: string } {
  try {
    const out = execFileSync('bun', [SCRIPT, '--root', join(FIXTURES, name)], {
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
    ['locale-keys', 'src/locales/en.yml'],
    ['locale-subs', 'src/locales/en.yml'],
  ])('refuse %s en citant %s', (name, file) => {
    const r = run(name);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain(file);
  });
});
