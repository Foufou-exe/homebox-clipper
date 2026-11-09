/**
 * Prints a version's section of CHANGELOG.md (without the version heading or the comparison
 * links). Usage: bun scripts/release-notes.ts <version|Unreleased> [--file <path>]
 *
 * Understands both heading styles of CHANGELOG.md: Keep a Changelog (`## [0.2.1] - 2026-11-09`) and
 * Release Please (`## [0.3.0](compare-url) (2026-11-20)`, or `## 0.3.0 (2026-11-20)` for a first entry).
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const file = fileIdx >= 0 ? args[fileIdx + 1] : 'CHANGELOG.md';
const version = args
  .find((_, i) => fileIdx < 0 || (i !== fileIdx && i !== fileIdx + 1))
  ?.replace(/^v/, '');

if (!version || !file) {
  console.error('Usage: release-notes <version|Unreleased> [--file <path>]');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');
const isHeading = (l: string) => l.startsWith('## ');
const isLink = (l: string) => /^\[[^\]]+\]:\s/.test(l);
const escaped = version.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
// `## [x.y.z]` (Keep a Changelog, or Release Please with a link) or `## x.y.z (date)` (Release Please).
const headingOf = new RegExp(String.raw`^## (\[${escaped}\]|v?${escaped}(\s|$))`, 'i');
const start = lines.findIndex((l) => headingOf.test(l));

if (start < 0) {
  console.error(`Version not found in ${file}: ${version}`);
  process.exit(1);
}

const body: string[] = [];
for (const l of lines.slice(start + 1)) {
  if (isHeading(l) || isLink(l)) break;
  body.push(l);
}
process.stdout.write(`${body.join('\n').trim()}\n`);
