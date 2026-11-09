/**
 * Prints the flattened content of src/locales/*.yml to stdout: { "fr": { "a.b.c": "value" } }.
 * Run by Bun (Bun.YAML); the Vitest tests (Node) call it in a subprocess.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** Code-unit order: deterministic on every machine (localeCompare would depend on the locale). */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const dir = join(import.meta.dir, '../src/locales');

function flatten(node: unknown, prefix: string, out: Record<string, string>): void {
  if (node === null || node === undefined) {
    out[prefix] = '';
  } else if (Array.isArray(node)) {
    throw new TypeError(`value of "${prefix}" must be a string, a number or a boolean (found an array)`);
  } else if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = String(node as string | number | boolean | bigint);
  }
}

const catalogs: Record<string, Record<string, string>> = {};
for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort(byCodeUnit)) {
  const out: Record<string, string> = {};
  flatten(Bun.YAML.parse(readFileSync(join(dir, file), 'utf8')), '', out);
  catalogs[basename(file, extname(file))] = out;
}
console.log(JSON.stringify(catalogs));
