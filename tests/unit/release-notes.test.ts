import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const FIXTURE = 'tests/fixtures/changelog/CHANGELOG.md';
const run = (args: string[]) =>
  execFileSync('bun', ['scripts/release-notes.ts', ...args, '--file', FIXTURE], { cwd: root, encoding: 'utf8' });

describe('scripts/release-notes.ts', () => {
  it('renvoie exactement la section demandée', () => {
    const out = run(['0.1.0']);
    expect(out.trim()).toBe(['### Added', '', '- Première version.', '- Deuxième élément.'].join('\n'));
    expect(out).not.toContain('0.2.0');
    expect(out).not.toContain('example.invalid');
  });

  it('ne renvoie pas les sections voisines (version intermédiaire)', () => {
    const out = run(['0.2.0']);
    expect(out).toContain('Correctif de la 0.2.0.');
    expect(out).not.toContain('Première version');
    expect(out).not.toContain('Élément en attente');
  });

  it('accepte Unreleased', () => {
    expect(run(['Unreleased'])).toContain('Élément en attente.');
  });

  it('version inconnue : code non nul avec message', () => {
    const r = spawnSync('bun', ['scripts/release-notes.ts', '9.9.9', '--file', FIXTURE], { cwd: root, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('9.9.9');
  });
});
