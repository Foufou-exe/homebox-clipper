/**
 * Valide les fichiers de réglage du dépôt (JSONC, YAML, versions de Bun, modèles d'issue).
 * Usage : bun scripts/check-config.ts [--root <dossier>]
 * Sortie non nulle, avec la liste des fichiers en erreur. Ne lit jamais `specs/` (absent en CI).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Champs obligatoires des modèles d'issue (`id`), recopiés de contracts/issue-templates.md. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  'bug.yml': ['etapes', 'attendu-obtenu', 'versions'],
  'merchant-detection.yml': ['marchand-domaine', 'champs', 'type-commande', 'version-extension'],
  'merchant-request.yml': ['nom-marchand', 'domaines', 'pays', 'factures'],
  'feature.yml': ['besoin'],
};

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const root = resolve(rootIdx >= 0 ? (argv[rootIdx + 1] ?? '.') : join(import.meta.dir, '..'));

const errors: string[] = [];
const fail = (file: string, msg: string): void => {
  errors.push(`${file} : ${msg}`);
};

const abs = (rel: string): string => join(root, rel);
const read = (rel: string): string => readFileSync(abs(rel), 'utf8');

/** Fichiers d'un dossier (récursif) dont le nom correspond à `ext`, chemins relatifs à la racine. */
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
    fail(rel, `JSON invalide (${(e as Error).message})`);
    return undefined;
  }
}

function parseYaml(rel: string): unknown {
  try {
    return Bun.YAML.parse(read(rel));
  } catch (e) {
    fail(rel, `YAML invalide (${(e as Error).message})`);
    return undefined;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// 1. Syntaxe des fichiers de réglage
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

// 2. Même version majeure.mineure de Bun partout
const bunVersions: Array<[string, string]> = [];
if (existsSync(abs('package.json'))) {
  try {
    const pkg = JSON.parse(read('package.json')) as { packageManager?: string };
    const m = /^bun@(\d+\.\d+)/.exec(pkg.packageManager ?? '');
    if (m?.[1]) bunVersions.push(['package.json', m[1]]);
    else fail('package.json', '`packageManager` doit valoir `bun@<majeure>.<mineure>.<correctif>`');
  } catch (e) {
    fail('package.json', `JSON invalide (${(e as Error).message})`);
  }
}
if (existsSync(abs('mise.toml'))) {
  const m = /^\s*bun\s*=\s*"(\d+\.\d+)/m.exec(read('mise.toml'));
  if (m?.[1]) bunVersions.push(['mise.toml', m[1]]);
  else fail('mise.toml', 'version de Bun introuvable (attendu : bun = "x.y")');
}
if (existsSync(abs('.devcontainer/post-create.sh'))) {
  const m = /bun@(\d+\.\d+)/.exec(read('.devcontainer/post-create.sh'));
  if (m?.[1]) bunVersions.push(['.devcontainer/post-create.sh', m[1]]);
  else fail('.devcontainer/post-create.sh', 'version de Bun introuvable (attendu : bun@x.y.z)');
}
const distinct = new Set(bunVersions.map(([, v]) => v));
if (distinct.size > 1) {
  for (const [file, v] of bunVersions) {
    fail(file, `version de Bun ${v} différente des autres fichiers (${[...distinct].join(' / ')})`);
  }
}

// 3. Étiquettes
const labelNames = new Set<string>();
const labelsFile = '.github/labels.yml';
const labels = yaml.get(labelsFile);
if (labels !== undefined) {
  if (!Array.isArray(labels)) fail(labelsFile, 'une liste d’étiquettes est attendue');
  else {
    for (const l of labels) {
      if (!isObj(l) || typeof l.name !== 'string') {
        fail(labelsFile, 'chaque étiquette doit avoir un `name`');
        continue;
      }
      if (labelNames.has(l.name)) fail(labelsFile, `nom d’étiquette en double : « ${l.name} »`);
      labelNames.add(l.name);
      if (typeof l.color !== 'string' || !/^[0-9a-fA-F]{6}$/.test(l.color)) {
        fail(labelsFile, `couleur invalide pour « ${l.name} » (6 chiffres hexadécimaux, sans #)`);
      }
      if (typeof l.description === 'string' && l.description.length > 100) {
        fail(labelsFile, `description de « ${l.name} » trop longue (${l.description.length} > 100)`);
      }
    }
  }
}

// 4. Modèles d'issue
const tplDir = '.github/ISSUE_TEMPLATE';
if (existsSync(abs(tplDir))) {
  for (const f of listFiles(tplDir, /\.ya?ml$/)) {
    const name = f.split('/').pop() ?? f;
    const doc = yaml.get(f);
    if (!isObj(doc)) {
      if (doc !== undefined) fail(f, 'document YAML de type objet attendu');
      continue;
    }
    if (name === 'config.yml') {
      if (doc.blank_issues_enabled !== false) fail(f, '`blank_issues_enabled` doit valoir false');
      continue;
    }
    const tplLabels = Array.isArray(doc.labels) ? doc.labels : [];
    for (const l of tplLabels) {
      if (!labelNames.has(String(l))) fail(f, `étiquette « ${String(l)} » absente de ${labelsFile}`);
    }
    const expected = REQUIRED_FIELDS[name];
    if (expected) {
      const body = Array.isArray(doc.body) ? doc.body : [];
      for (const id of expected) {
        const item = body.find((b) => isObj(b) && b.id === id);
        if (!isObj(item)) fail(f, `champ « ${id} » manquant`);
        else if (!isObj(item.validations) || item.validations.required !== true) {
          fail(f, `champ « ${id} » doit avoir validations.required: true`);
        }
      }
    }
  }
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    if (!existsSync(abs(`${tplDir}/${name}`))) fail(`${tplDir}/${name}`, 'modèle d’issue manquant');
  }
}

if (errors.length > 0) {
  console.error(`Réglages invalides (${errors.length}) :`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Réglages valides : ${jsonFiles.length} fichiers JSON(C), ${yamlFiles.length} fichiers YAML.`);
