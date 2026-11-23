import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Spec 028: documentation website (docs/site/, Astro Starlight) published on GitHub Pages. These checks read
 * files as text only (no install, no build: `bun run docs:build` does that). Fixed values only, never a git
 * reference.
 */
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
/** Workflow text without comments, so a comment saying "no schedule" does not count. */
const code = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .join('\n');
const CONTENT = 'docs/site/src/content/docs';
function pages(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.mdx?$/.test(name)) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

describe('[docs] docs.yml: Pages publication, sparing GitHub Actions minutes', () => {
  const raw = read('.github/workflows/docs.yml');
  const wf = code(raw);

  it('no schedule, no matrix, no pull_request trigger', () => {
    expect(wf).not.toMatch(/\bschedule\s*:/);
    expect(wf).not.toMatch(/\bmatrix\s*:/);
    expect(wf).not.toMatch(/pull_request/);
  });

  it('triggers: push on main limited to the site and the workflow, and on demand', () => {
    expect(wf).toMatch(
      /^ {2}push:\n {4}branches: \[main\]\n {4}paths:\n {6}- 'docs\/site\/\*\*'\n {6}- '\.github\/workflows\/docs\.yml'$/m,
    );
    expect(wf).toMatch(/^ {2}workflow_dispatch:$/m);
  });

  it('a newer run cancels the one in progress; short timeouts; ubuntu only', () => {
    expect(wf).toMatch(/^concurrency:\n {2}group: pages\n {2}cancel-in-progress: true$/m);
    const timeouts = [...wf.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
    expect(timeouts).toHaveLength(2);
    for (const t of timeouts) expect(t).toBeLessThanOrEqual(10);
    const runners = [...wf.matchAll(/runs-on: (\S+)/g)].map((m) => m[1]);
    expect(runners).toEqual(['ubuntu-latest', 'ubuntu-latest']);
  });

  it('minimal permissions: none by default, contents: read to build, pages + id-token to deploy', () => {
    expect(wf).toMatch(/^permissions: \{\}$/m);
    expect(wf).toMatch(/^ {6}contents: read$/m);
    expect(wf).toMatch(/^ {6}pages: write\n {6}id-token: write$/m);
    expect(wf).not.toMatch(/write-all|contents: write/);
  });

  it('official Pages actions, every action pinned by commit SHA', () => {
    const uses = [...wf.matchAll(/uses: (\S+)/g)].map((m) => m[1]!);
    expect(uses.some((u) => u.startsWith('actions/upload-pages-artifact@'))).toBe(true);
    expect(uses.some((u) => u.startsWith('actions/deploy-pages@'))).toBe(true);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });

  it('builds with a frozen lockfile and uploads docs/site/dist', () => {
    expect(wf).toContain('bun install --cwd docs/site --frozen-lockfile --ignore-scripts');
    expect(wf).toContain('bun run --cwd docs/site build');
    expect(wf).toMatch(/path: docs\/site\/dist$/m);
  });
});

describe('[docs] site project: separate, pinned, private', () => {
  it('GitHub Pages address: site + base', () => {
    const config = read('docs/site/astro.config.mjs');
    expect(config).toContain("site: 'https://foufou-exe.github.io'");
    expect(config).toContain("base: '/homebox-clipper'");
    expect(config).toContain("defaultLocale: 'root'");
    expect(config).toMatch(/fr: \{ label: 'Français', lang: 'fr' \}/);
    expect(config).toContain('starlightLinksValidator(');
  });

  it('no third-party script, font or analytics declared in the configuration', () => {
    // Comments removed (they may quote a local address); URLs keep their "//".
    const config = read('docs/site/astro.config.mjs').replace(/(^|\s)\/\/.*$/gm, '');
    expect(config).not.toMatch(
      /fonts\.googleapis|googletagmanager|plausible|umami|analytics\.js|gtag/,
    );
    expect(config).not.toMatch(/head:\s*\[/);
    const hosts = [...config.matchAll(/https?:\/\/([^/'"`\s]+)/g)].map((m) => m[1]);
    for (const host of hosts) expect(host).toMatch(/^(github\.com|foufou-exe\.github\.io)$/);
  });

  it('own package.json and lockfile, exact dependency versions', () => {
    expect(existsSync(resolve(root, 'docs/site/bun.lock'))).toBe(true);
    const pkg = JSON.parse(read('docs/site/package.json')) as {
      private?: boolean;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.private).toBe(true);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).length).toBeGreaterThan(0);
    for (const [name, version] of Object.entries(deps))
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('root scripts: docs:build and docs:dev exist, the site is not part of bun run ci', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts['docs:install']).toContain('--frozen-lockfile');
    expect(scripts['docs:build']).toContain('docs:install');
    expect(scripts['docs:dev']).toBeDefined();
    expect(scripts.ci).not.toContain('docs');
  });

  it('the extension tooling ignores the site', () => {
    expect(read('eslint.config.js')).toContain("'docs/site/'");
    const gitignore = read('.gitignore');
    expect(gitignore).toMatch(/^docs\/site\/dist\/$/m);
    expect(gitignore).toMatch(/^docs\/site\/\.astro\/$/m);
  });
});

describe('[docs] content: English and French, same pages', () => {
  const en = pages(resolve(root, CONTENT)).filter((p) => !p.startsWith('fr/'));
  const fr = pages(resolve(root, CONTENT, 'fr'));

  it('every page exists in both languages', () => {
    expect(en.length).toBeGreaterThanOrEqual(15);
    expect(fr).toEqual(en);
  });

  it.each(fr)('fr/%s: internal links stay in the French site', (page) => {
    const text = read(`${CONTENT}/fr/${page}`);
    const links = [
      ...text.matchAll(/(?:\]\(|href=["']|link: )(\/homebox-clipper\/[^)"'\s]*)/g),
    ].map((m) => m[1]!);
    for (const link of links) expect(link).toMatch(/^\/homebox-clipper\/fr\//);
  });

  it.each([...en, ...fr.map((p) => `fr/${p}`)])(
    '%s: fictitious examples only, no real-looking API key',
    (page) => {
      const text = read(`${CONTENT}/${page}`);
      for (const key of text.match(/hb_[A-Za-z0-9]{8,}/g) ?? []) expect(key).toBe('hb_xxxxxxxx');
    },
  );
});

describe('[docs] GitHub wiki: redirect pages only', () => {
  const wiki = readdirSync(resolve(root, 'docs/wiki')).filter(
    (f) => f.endsWith('.md') && !f.startsWith('_'),
  );

  it.each(wiki)('docs/wiki/%s links to the documentation site', (file) => {
    expect(read(`docs/wiki/${file}`)).toContain('](https://foufou-exe.github.io/homebox-clipper/');
  });

  it('redirect pages stay short (the content lives on the site)', () => {
    for (const file of wiki)
      expect(read(`docs/wiki/${file}`).split('\n').length, file).toBeLessThanOrEqual(30);
  });
});
