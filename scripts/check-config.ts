/**
 * Validates the repository's settings files (JSONC, YAML, Bun versions, issue templates).
 * Usage: bun scripts/check-config.ts [--root <folder>]
 * Non-zero exit, with the list of failing files. Never reads `specs/` (absent in CI).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Required fields of the issue templates (`id`). */
const REQUIRED_FIELDS: Record<string, string[]> = {
  'bug.yml': [
    'extension-version',
    'browser',
    'homebox-version',
    'ui-language',
    'area',
    'steps',
    'expected-actual',
    'privacy',
  ],
  'merchant-detection.yml': [
    'merchant-domain',
    'site-language',
    'fields',
    'order-type',
    'observed-expected',
    'extension-version',
    'privacy',
  ],
  'merchant-request.yml': ['merchant-name', 'domains', 'country', 'site-language', 'invoices', 'checks'],
  'feature.yml': ['need', 'proposal', 'checks'],
  'question.yml': ['question', 'checks'],
};

/** Privacy warning that every issue template must contain, word for word. */
const PRIVACY_WARNING =
  'Never attach raw store pages, API keys, real instance addresses (public or local) or personal data.';

/** Field types accepted by GitHub issue forms. */
const FORM_TYPES = new Set(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']);

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? (argv[rootIdx + 1] ?? '.') : join(import.meta.dir, '..'));

const errors: string[] = [];
const fail = (file: string, msg: string): void => {
  errors.push(`${file}: ${msg}`);
};

const abs = (rel: string): string => join(root, rel);
const read = (rel: string): string => readFileSync(abs(rel), 'utf8');

/** Files of a folder (recursive) whose name matches `ext`, paths relative to the root. */
function listFiles(dir: string, ext: RegExp): string[] {
  const start = abs(dir);
  if (!existsSync(start)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (ext.test(name)) out.push(relative(root, p));
    }
  };
  walk(start);
  return out.sort();
}

function parseJsonc(rel: string): unknown {
  try {
    return Bun.JSONC.parse(read(rel));
  } catch (e) {
    fail(rel, `invalid JSON (${(e as Error).message})`);
    return undefined;
  }
}

function parseYaml(rel: string): unknown {
  try {
    return Bun.YAML.parse(read(rel));
  } catch (e) {
    fail(rel, `invalid YAML (${(e as Error).message})`);
    return undefined;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// 1. Syntax of the settings files
const jsonFiles = [
  ...listFiles('.vscode', /\.json$/),
  ...(existsSync(abs('.devcontainer/devcontainer.json')) ? ['.devcontainer/devcontainer.json'] : []),
  ...(existsSync(abs('tsconfig.json')) ? ['tsconfig.json'] : []),
];
for (const f of jsonFiles) parseJsonc(f);

const yamlFiles = [
  ...listFiles('.github', /\.ya?ml$/),
  ...(existsSync(abs('compose.yaml')) ? ['compose.yaml'] : []),
  ...listFiles('src/locales', /\.ya?ml$/),
];
const yaml = new Map<string, unknown>();
for (const f of yamlFiles) yaml.set(f, parseYaml(f));

// 1b. Translation catalogs: en.yml is the reference, fr.yml must have the same keys and the same
// `$n` substitutions (contracts/locales.md). Checked as soon as both exist.
function flatten(node: unknown, prefix: string, out: Map<string, string>): void {
  if (isObj(node)) for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out.set(prefix, String(node ?? ''));
}
const enFile = 'src/locales/en.yml';
const frFile = 'src/locales/fr.yml';
if (yaml.get(enFile) !== undefined && yaml.get(frFile) !== undefined) {
  const en = new Map<string, string>();
  const fr = new Map<string, string>();
  flatten(yaml.get(enFile), '', en);
  flatten(yaml.get(frFile), '', fr);
  const subs = (v: string): string => [...new Set(v.match(/\$[1-9]/g) ?? [])].sort().join(' ');
  for (const key of fr.keys()) if (!en.has(key)) fail(enFile, `key "${key}" missing (present in ${frFile})`);
  for (const key of en.keys()) if (!fr.has(key)) fail(frFile, `key "${key}" missing (present in ${enFile})`);
  for (const [key, value] of en) {
    const other = fr.get(key);
    if (other !== undefined && subs(value) !== subs(other)) {
      fail(enFile, `substitutions of "${key}" differ from those of ${frFile}`);
    }
  }
}

// 2. Same major.minor Bun version everywhere
const bunVersions: Array<[string, string]> = [];
if (existsSync(abs('package.json'))) {
  try {
    const pkg = JSON.parse(read('package.json')) as { packageManager?: string };
    const m = /^bun@(\d+\.\d+)/.exec(pkg.packageManager ?? '');
    if (m?.[1]) bunVersions.push(['package.json', m[1]]);
    else fail('package.json', '`packageManager` must be `bun@<major>.<minor>.<patch>`');
  } catch (e) {
    fail('package.json', `invalid JSON (${(e as Error).message})`);
  }
}
if (existsSync(abs('mise.toml'))) {
  const m = /^\s*bun\s*=\s*"(\d+\.\d+)/m.exec(read('mise.toml'));
  if (m?.[1]) bunVersions.push(['mise.toml', m[1]]);
  else fail('mise.toml', 'Bun version not found (expected: bun = "x.y")');
}
if (existsSync(abs('.devcontainer/post-create.sh'))) {
  const m = /bun@(\d+\.\d+)/.exec(read('.devcontainer/post-create.sh'));
  if (m?.[1]) bunVersions.push(['.devcontainer/post-create.sh', m[1]]);
  else fail('.devcontainer/post-create.sh', 'Bun version not found (expected: bun@x.y.z)');
}
const distinct = new Set(bunVersions.map(([, v]) => v));
if (distinct.size > 1) {
  for (const [file, v] of bunVersions) {
    fail(file, `Bun version ${v} differs from the other files (${[...distinct].join(' / ')})`);
  }
}

// 3. Labels
const labelNames = new Set<string>();
const labelsFile = '.github/labels.yml';
const labels = yaml.get(labelsFile);
if (labels !== undefined) {
  if (!Array.isArray(labels)) fail(labelsFile, 'a list of labels is expected');
  else {
    for (const l of labels) {
      if (!isObj(l) || typeof l.name !== 'string') {
        fail(labelsFile, 'each label must have a `name`');
        continue;
      }
      if (labelNames.has(l.name)) fail(labelsFile, `duplicate label name: "${l.name}"`);
      labelNames.add(l.name);
      if (typeof l.color !== 'string' || !/^[0-9a-fA-F]{6}$/.test(l.color)) {
        fail(labelsFile, `invalid color for "${l.name}" (6 hexadecimal digits, no #)`);
      }
      if (typeof l.description === 'string' && l.description.length > 100) {
        fail(labelsFile, `description of "${l.name}" too long (${l.description.length} > 100)`);
      }
    }
  }
}

// 4. Issue templates
const tplDir = '.github/ISSUE_TEMPLATE';
if (existsSync(abs(tplDir))) {
  for (const f of listFiles(tplDir, /\.ya?ml$/)) {
    const name = f.split('/').pop() ?? f;
    const doc = yaml.get(f);
    if (!isObj(doc)) {
      if (doc !== undefined) fail(f, 'YAML document of type object expected');
      continue;
    }
    if (name === 'config.yml') {
      if (doc.blank_issues_enabled !== false) fail(f, '`blank_issues_enabled` must be false');
      continue;
    }
    const tplLabels = Array.isArray(doc.labels) ? doc.labels : [];
    for (const l of tplLabels) {
      if (!labelNames.has(String(l))) fail(f, `label "${String(l)}" missing from ${labelsFile}`);
    }
    // Issue form schema: valid types, unique ids, boolean `validations.required`.
    const body: unknown[] = Array.isArray(doc.body) ? doc.body : [];
    const seen = new Set<string>();
    for (const [i, b] of body.entries()) {
      if (!isObj(b) || typeof b.type !== 'string' || !FORM_TYPES.has(b.type)) {
        fail(f, `body[${i}]: invalid type (expected: ${[...FORM_TYPES].join(', ')})`);
        continue;
      }
      if (b.type !== 'markdown') {
        if (typeof b.id !== 'string' || b.id === '') fail(f, `body[${i}]: \`id\` missing`);
        else if (seen.has(b.id)) fail(f, `duplicate field id: "${b.id}"`);
        else seen.add(b.id);
      }
      if (b.validations !== undefined) {
        if (!isObj(b.validations) || typeof b.validations.required !== 'boolean') {
          fail(f, `body[${i}]: \`validations.required\` must be a boolean`);
        }
      }
    }
    if (!JSON.stringify(body).includes(PRIVACY_WARNING)) fail(f, 'privacy warning missing');
    const expected = REQUIRED_FIELDS[name];
    if (expected) {
      for (const id of expected) {
        const item = body.find((b) => isObj(b) && b.id === id);
        if (!isObj(item)) fail(f, `field "${id}" missing`);
        else if (item.type === 'checkboxes') {
          const opts = isObj(item.attributes) && Array.isArray(item.attributes.options) ? item.attributes.options : [];
          if (!opts.some((o) => isObj(o) && o.required === true)) {
            fail(f, `field "${id}" must have a checkbox with required: true`);
          }
        } else if (!isObj(item.validations) || item.validations.required !== true) {
          fail(f, `field "${id}" must have validations.required: true`);
        }
      }
    }
  }
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    if (!existsSync(abs(`${tplDir}/${name}`))) fail(`${tplDir}/${name}`, 'issue template missing');
  }
}

if (errors.length > 0) {
  console.error(`Invalid settings (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Valid settings: ${jsonFiles.length} JSON(C) files, ${yamlFiles.length} YAML files.`);
