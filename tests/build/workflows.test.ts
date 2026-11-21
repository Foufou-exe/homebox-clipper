import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 017 (Firefox support), user instructions on GitHub Actions: Chrome and Firefox are built and checked in the
 * SAME CI job, without matrix and without `schedule`; the release attaches the Firefox and source archives while
 * the Chrome Web Store job only ever sends the Chrome archive (FR-006). Fixed values only, read from the working
 * tree as text (comments removed before the checks, so a comment saying "no schedule" does not count).
 */
const read = (name: string) =>
  readFileSync(resolve(__dirname, '../../.github/workflows', name), 'utf8');
const code = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .join('\n');
/** Names of the jobs (2-space keys under `jobs:`). */
const jobs = (text: string) =>
  [...code(text.slice(text.indexOf('\njobs:'))).matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]);
/** Raw text of one job, from its key to the next job (or the end of the file). */
function job(text: string, name: string) {
  const start = text.indexOf(`\n  ${name}:`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\s*\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('[workflows] ci.yml: both browsers in a single job', () => {
  const ci = read('ci.yml');

  it('no schedule, no matrix, no pull_request_target', () => {
    expect(code(ci)).not.toMatch(/\bschedule\s*:/);
    expect(code(ci)).not.toMatch(/\bmatrix\s*:/);
    expect(code(ci)).not.toMatch(/pull_request_target/);
  });

  it('a single job `check`, 10-minute timeout, runs bun run ci', () => {
    expect(jobs(ci)).toEqual(['check']);
    expect(code(ci)).toMatch(/^ {4}timeout-minutes: 10$/m);
    expect(code(ci)).toMatch(/^ {6}- run: bun run ci$/m);
  });

  it('triggers: pull_request, push, workflow_dispatch; superseded pull request runs are cancelled', () => {
    expect(code(ci)).toMatch(/^ {2}pull_request:$/m);
    expect(code(ci)).toMatch(/^ {2}push:$/m);
    expect(code(ci)).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(code(ci)).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});

describe('[workflows] release.yml: three archives, Chrome Web Store job untouched', () => {
  const release = read('release.yml');

  it('no schedule, no matrix', () => {
    expect(code(release)).not.toMatch(/\bschedule\s*:/);
    expect(code(release)).not.toMatch(/\bmatrix\s*:/);
  });

  it('the chrome-web-store job only downloads the Chrome archive and its checksum (FR-006)', () => {
    const cws = job(release, 'chrome-web-store');
    expect(cws).toContain("--pattern 'homebox-clipper-*-chrome.zip'");
    expect(cws).toContain("--pattern 'homebox-clipper-*-chrome.zip.sha256'");
    expect(cws).not.toMatch(/firefox/i);
    expect(cws).not.toMatch(/sources/i);
  });

  it('the publish job builds and checks the Firefox and source archives', () => {
    const publish = job(release, 'publish');
    expect(publish).toContain('for b in chrome firefox; do');
    expect(publish).toContain('-sources.zip');
    expect(publish).toContain('homebox-clipper@foufou-exe.github.io');
    expect(publish).toContain('::error::Unexpected file in the source archive: $entry');
    expect(publish).toContain('## Checksums');
  });

  it('the source check rejects key files, `..` segments and absolute paths, and fails on an unreadable or empty archive', () => {
    const publish = job(release, 'publish');
    expect(publish).toContain(
      "grep -Eq '^(homebox|tests|specs|coverage|node_modules|\\.output)/|(^|/)raw/|\\.pepper$|(^|/)\\.env|\\.(pem|key|p12|pfx)$|(^|/)\\.\\.(/|$)|^/'",
    );
    expect(publish).toContain('names="$(unzip -Z1 "$sources")"');
    expect(publish).toContain('if [ -z "$names" ]; then');
    expect(publish).toContain('done <<< "$names"');
    expect(publish).not.toContain('< <(unzip -Z1');
  });
});
