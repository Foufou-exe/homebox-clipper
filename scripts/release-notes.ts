/**
 * Affiche la section d'une version de CHANGELOG.md (sans le titre de version ni les liens de
 * comparaison). Usage : bun scripts/release-notes.ts <version|Unreleased> [--file <chemin>]
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const file = fileIdx >= 0 ? args[fileIdx + 1] : 'CHANGELOG.md';
const version = args.filter((_, i) => fileIdx < 0 || (i !== fileIdx && i !== fileIdx + 1))[0]?.replace(/^v/, '');

if (!version || !file) {
  console.error('Usage : release-notes <version|Unreleased> [--file <chemin>]');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');
const isHeading = (l: string) => /^## \[/.test(l);
const isLink = (l: string) => /^\[[^\]]+\]:\s/.test(l);
const start = lines.findIndex((l) => l.toLowerCase().startsWith(`## [${version.toLowerCase()}]`));

if (start < 0) {
  console.error(`Version introuvable dans ${file} : ${version}`);
  process.exit(1);
}

const body: string[] = [];
for (const l of lines.slice(start + 1)) {
  if (isHeading(l) || isLink(l)) break;
  body.push(l);
}
process.stdout.write(`${body.join('\n').trim()}\n`);
