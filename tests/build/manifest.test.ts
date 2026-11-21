import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Runs after `bun run build` (`test:build` script) — principle V. Both builds (Chrome, Firefox) are
 * checked with the same rules; every title starts with the browser name, so a failure names the build
 * and the rule (spec 017, FR-020). Fixed values only; this test never builds anything.
 */
type Manifest = Record<string, unknown>;

const outDir = resolve(__dirname, '../../.output');
const manifestPath = (dir: string) => resolve(outDir, dir, 'manifest.json');
const readManifest = (dir: string): Manifest =>
  existsSync(manifestPath(dir))
    ? (JSON.parse(readFileSync(manifestPath(dir), 'utf8')) as Manifest)
    : {};
const packageVersion = (
  JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string }
).version;

const GECKO = {
  gecko: {
    id: 'homebox-clipper@foufou-exe.github.io',
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['websiteContent'] },
  },
};

const BACKGROUND: Record<string, unknown> = {
  chrome: { service_worker: 'background.js' },
  firefox: { scripts: ['background.js'] },
};

describe.each([
  ['chrome', 'chrome-mv3'],
  ['firefox', 'firefox-mv3'],
])('[%s] production manifest', (browser, dir) => {
  const path = manifestPath(dir);
  const manifest = readManifest(dir);
  const t = (title: string) => `[${browser}] ${title}`;

  it(t('M1 exists (run `bun run build` first)'), () => {
    expect(existsSync(path)).toBe(true);
  });

  it(t('M2 manifest_version is 3'), () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it(t('M3 only requests storage, activeTab and scripting (permissions)'), () => {
    expect(new Set(manifest.permissions as string[])).toEqual(
      new Set(['storage', 'activeTab', 'scripting']),
    );
  });

  it(t('M4 has no static host_permissions or content_scripts'), () => {
    expect(existsSync(path)).toBe(true);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it(
    t('M5 HomeBox access only as an optional permission (exact origin granted at runtime)'),
    () => {
      expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
    },
  );

  it(t('M6 icon tooltip: displayed name of the extension'), () => {
    expect((manifest.action as { default_title?: string } | undefined)?.default_title).toBe(
      'HomeBox Clipper',
    );
  });

  it(t('M7 a single build: name from the catalog, no mode suffix'), () => {
    expect(manifest.name).toBe('__MSG_extName__');
    expect(manifest.description).toBe('__MSG_extDescription__');
  });

  // English is the default language; French is served from _locales/fr.
  it(t('M8 default language en, with both the en and fr locale folders'), () => {
    expect(manifest.default_locale).toBe('en');
    const locales = resolve(path, '../_locales');
    expect(readdirSync(locales).sort()).toEqual(['en', 'fr']);
    for (const lang of ['en', 'fr']) {
      const messages = JSON.parse(
        readFileSync(resolve(locales, `${lang}/messages.json`), 'utf8'),
      ) as Manifest;
      expect(messages, lang).toHaveProperty('extName');
      expect(messages, lang).toHaveProperty('extDescription');
    }
  });

  it(t('M9 CSP without unsafe-eval or remote source'), () => {
    expect(existsSync(path)).toBe(true);
    const csp = JSON.stringify(manifest.content_security_policy ?? '');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it(t('M10 no build file contains remote code'), () => {
    const background = readFileSync(resolve(path, '../background.js'), 'utf8');
    expect(background).not.toMatch(/\beval\(|new Function\(/);
  });

  it(t('M11 version equals package.json'), () => {
    expect(manifest.version).toBe(packageVersion);
  });

  it(t('M12 background entry'), () => {
    expect(manifest.background).toEqual(BACKGROUND[browser]);
  });

  if (browser === 'firefox') {
    it(
      t(
        'F1 browser_specific_settings: fixed Gecko id, minimum version 140, data collection declared',
      ),
      () => {
        expect(manifest.browser_specific_settings).toEqual(GECKO);
      },
    );
  } else {
    it(t('C1 no browser_specific_settings'), () => {
      expect(manifest.browser_specific_settings).toBeUndefined();
    });
  }
});

describe('[chrome vs firefox] same permissions model', () => {
  const chrome = readManifest('chrome-mv3');
  const firefox = readManifest('firefox-mv3');

  it('[chrome vs firefox] X1 same permissions, optional hosts, version, locale, name, description, action, options_ui', () => {
    const pick = (m: Manifest) => ({
      permissions: [...((m.permissions as string[] | undefined) ?? [])].sort(),
      optional_host_permissions: m.optional_host_permissions,
      version: m.version,
      default_locale: m.default_locale,
      name: m.name,
      description: m.description,
      action: m.action,
      options_ui: m.options_ui,
    });
    expect(Object.keys(chrome)).not.toHaveLength(0);
    expect(pick(firefox)).toEqual(pick(chrome));
  });

  it('[chrome vs firefox] X2 same top-level keys except background and browser_specific_settings', () => {
    const keys = (m: Manifest) =>
      Object.keys(m)
        .filter((k) => k !== 'background' && k !== 'browser_specific_settings')
        .sort();
    expect(Object.keys(chrome)).not.toHaveLength(0);
    expect(keys(firefox)).toEqual(keys(chrome));
  });
});
