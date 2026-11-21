import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Firefox documentation (spec 017, FR-024 à FR-027). Reads the files of the working tree; fixed values only,
 * never a git reference.
 */
const root = resolve(__dirname, '../..');
/** Raw text of a file. */
const raw = (path: string) => readFileSync(resolve(root, path), 'utf8');
/** Text with line breaks folded, for sentences wrapped in the Markdown source. */
const prose = (path: string) => raw(path).replace(/\s+/g, ' ');

/** Hosts allowed in the privacy and store documents: project, Mozilla and tooling links, the one Amazon store cited as an example, plus fictitious or local addresses. */
const ALLOWED_HOST = /(^|\.)(example\.com|localhost|github\.com|githubusercontent\.com|mozilla\.org|shields\.io|bun\.sh|www\.amazon\.de|127\.0\.0\.1)$/;
/** Same, plus the tooling and documentation hosts used by the guides (not instance addresses). */
const ALLOWED_HOST_GUIDES = /(^|\.)(example\.com|localhost|github\.com|githubusercontent\.com|mozilla\.org|shields\.io|bun\.sh|nodejs\.org|mise\.jdx\.dev|sonarcloud\.io|feathericons\.com|keepachangelog\.com|conventionalcommits\.org|semver\.org|chrome\.google\.com|console\.cloud\.google\.com|developers\.google\.com|www\.googleapis\.com|developer\.chrome\.com|127\.0\.0\.1|192\.0\.2\.10)$/;
/** Hosts of the URLs in a text; the wildcard patterns of the manifest (a star as host) are not addresses. */
const hostsOf = (text: string) =>
  [...text.matchAll(/https?:\/\/([^/\s`'")<>\]:]+)/g)].map((m) => m[1]!.toLowerCase()).filter((h) => h !== '*');

describe('Firefox documentation, privacy and AMO listing (017, FR-024 à FR-026, T052)', () => {
  it('PRIVACY.md: Firefox Add-ons, declaration, about:addons, neutral browser wording', () => {
    const doc = prose('PRIVACY.md');
    expect(doc).toContain('Firefox Add-ons');
    expect(doc).toContain('addons.mozilla.org');
    expect(doc).toContain('about:addons');
    expect(doc).toContain('websiteContent');
    expect(doc).toContain('the version the browser has ready');
    expect(doc).not.toContain('the version Chrome has ready');
    expect(doc).toContain('Effective date: **21 November 2026**');
    expect(doc).toContain('the text and the product photo of the Amazon order page');
    expect(doc).not.toContain('product image address');
  });

  it('PRIVACY.fr.md: the same elements in French', () => {
    const doc = prose('PRIVACY.fr.md');
    expect(doc).toContain('Firefox Add-ons');
    expect(doc).toContain('addons.mozilla.org');
    expect(doc).toContain('about:addons');
    expect(doc).toContain('websiteContent');
    expect(doc).toContain('la version que le navigateur a prête');
    expect(doc).not.toContain('la version prête à être installée par Chrome');
    expect(doc).toContain('Date d\'effet : **21 novembre 2026**');
    expect(doc).toContain('la photo du produit de la page de commande Amazon');
    expect(doc).not.toContain('l\'image du produit');
  });

  it('docs/store/amo-listing.md: the nine sections and the key values', () => {
    const doc = raw('docs/store/amo-listing.md');
    for (const title of ['Basics', 'Summary', 'Description', 'Permissions', 'Data collection', 'Source code', 'Notes to reviewer', 'Screenshots', 'Submission checklist']) {
      expect(doc).toMatch(new RegExp(`^## \\d+\\. ${title}`, 'm'));
    }
    const text = prose('docs/store/amo-listing.md');
    for (const value of ['storage', 'activeTab', 'scripting', 'homebox-clipper@foufou-exe.github.io', '140', 'websiteContent', 'amo-build.md', 'docker compose up -d', 'hb_xxxxxxxx']) {
      expect(text).toContain(value);
    }
    expect(text).toMatch(/Firefox for Android/);
    expect(text).toMatch(/untick|uncheck|unchecked/i);
  });

  it('amo-listing.md: summaries are at most 250 characters (EN and FR)', () => {
    const doc = raw('docs/store/amo-listing.md');
    const summary = doc.split(/^## \d+\. Summary/m)[1]!.split(/^## \d+\./m)[0]!;
    const blocks = [...summary.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim());
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block.length).toBeLessThanOrEqual(250);
  });

  it('docs/store/listing.md points to the AMO listing on its first lines', () => {
    const head = raw('docs/store/listing.md').split('\n').slice(0, 4).join('\n');
    expect(head).toMatch(/^# Chrome Web Store: listing texts\n\nFirefox: see/);
    expect(head).toContain('Firefox: see [amo-listing.md](./amo-listing.md)');
  });

  it.each(['PRIVACY.md', 'PRIVACY.fr.md', 'docs/store/amo-listing.md', 'docs/store/listing.md'])(
    '%s: only fictitious or local instance addresses, no real-looking API key',
    (path) => {
      const text = raw(path);
      for (const host of hostsOf(text)) expect(host, `${path}: ${host}`).toMatch(ALLOWED_HOST);
      for (const key of text.match(/hb_[A-Za-z0-9]{8,}/g) ?? []) expect(key).toBe('hb_xxxxxxxx');
    },
  );
});

describe('Firefox documentation, install, release and contribution guides (017, FR-012, FR-027, T060)', () => {
  it('README.md: badge, temporary loading, unsigned archive, Firefox 140', () => {
    const doc = prose('README.md');
    expect(doc).toContain('Firefox-140%2B');
    expect(doc).toContain('about:debugging#/runtime/this-firefox');
    expect(doc).toContain('Load Temporary Add-on');
    expect(doc).toContain('.output/firefox-mv3/');
    expect(doc).toMatch(/homebox-clipper-<version>-firefox\.zip/);
    expect(doc).toMatch(/not signed by Mozilla/i);
    expect(doc).toContain('Firefox 140');
    expect(doc).toContain('an "Update now" button when the browser has one ready');
    expect(doc).not.toContain('when Chrome has one ready');
  });

  it('README.fr.md: the same elements in French', () => {
    const doc = prose('README.fr.md');
    expect(doc).toContain('Firefox-140%2B');
    expect(doc).toContain('about:debugging#/runtime/this-firefox');
    expect(doc).toContain('Charger un module complémentaire temporaire');
    expect(doc).toContain('.output/firefox-mv3/');
    expect(doc).toMatch(/homebox-clipper-<version>-firefox\.zip/);
    expect(doc).toMatch(/pas signée par Mozilla/i);
    expect(doc).toContain('Firefox 140');
    expect(doc).toContain('quand le navigateur en a une prête');
    expect(doc).not.toContain('quand Chrome en a une prête');
  });

  it('wiki Installation: dev:firefox, build output, about:debugging, about:addons, 140', () => {
    const doc = prose('docs/wiki/Installation.md');
    expect(doc).toContain('bun run dev:firefox');
    expect(doc).toContain('.output/firefox-mv3/');
    expect(doc).toContain('about:debugging');
    expect(doc).toContain('about:addons');
    expect(doc).toContain('140');
  });

  it('wiki Releasing: three archives, AMO submission, Android unticked, checksums', () => {
    const doc = prose('docs/wiki/Releasing.md');
    expect(doc).toContain('-firefox.zip');
    expect(doc).toContain('-sources.zip');
    expect(doc).toContain('addons.mozilla.org');
    expect(doc).toContain('Firefox for Android');
    expect(doc).toContain('Checksums');
    expect(doc).toContain('amo-listing.md');
    expect(doc).toContain('amo-build.md');
    expect(doc).toContain('the three archives with their `.sha256` files and the Checksums section');
    expect(doc).not.toContain('the two attached files');
  });

  it('wiki Troubleshooting: Firefox FAQ and the differences with Chrome (FR-012)', () => {
    const doc = prose('docs/wiki/Troubleshooting-and-FAQ.md');
    expect(doc).toContain('Does it work on Firefox?');
    expect(doc).not.toContain('Not yet: Chrome and Chromium only');
    expect(doc).toContain('about:addons');
    expect(doc).toMatch(/private (window|browsing)/i);
    expect(doc).toMatch(/temporarily/i);
    expect(doc).toMatch(/"Update now" button/);
    expect(doc).toMatch(/Firefox for Android|Android/);
    expect(doc).toMatch(/Differences between Firefox and Chrome/i);
  });

  it('wiki Home: Chrome and Firefox', () => {
    expect(prose('docs/wiki/Home.md')).toContain('a browser extension for Chrome and Firefox (Manifest V3)');
  });

  it('wiki generic pages: neutral browser wording and Firefox access removal', () => {
    expect(prose('docs/wiki/Usage.md')).toContain('When the browser has an update ready');
    expect(prose('docs/wiki/Configuration.md')).toMatch(/the browser asks for permission/i);
    const sec = prose('docs/wiki/Security-and-privacy.md');
    expect(sec).toContain('about:addons');
    expect(sec).toContain('websiteContent');
    expect(sec).not.toContain('as signalled by Chrome');
    expect(prose('docs/wiki/Local-HomeBox-instance.md')).toContain('.output/firefox-mv3/');
  });

  it('CONTRIBUTING.md: dev:firefox, Firefox output, three archives', () => {
    const doc = prose('CONTRIBUTING.md');
    expect(doc).toContain('bun run dev:firefox');
    expect(doc).toContain('.output/firefox-mv3/');
    expect(doc).toContain('homebox-clipper-X.Y.Z-firefox.zip');
    expect(doc).toContain('homebox-clipper-X.Y.Z-sources.zip');
  });

  it('SECURITY.md: the browser version', () => {
    const doc = prose('SECURITY.md');
    expect(doc).toContain('the extension version and the browser version');
    expect(doc).not.toContain('the Chrome version');
  });

  it('bug.yml: Firefox in the browser field, id kept', () => {
    const doc = raw('.github/ISSUE_TEMPLATE/bug.yml');
    expect(doc).toContain('about:support');
    expect(doc).toContain('Firefox 153');
    expect(doc).toContain('about:addons');
    expect(doc).toMatch(/^ {4}id: browser$/m);
    expect(doc).toMatch(/^ {4}id: extension-version$/m);
  });

  it.each(['README.md', 'README.fr.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/wiki/Installation.md', 'docs/wiki/Releasing.md', 'docs/wiki/Troubleshooting-and-FAQ.md'])(
    '%s: only fictitious or local instance addresses, no real-looking API key',
    (path) => {
      const text = raw(path);
      for (const host of hostsOf(text)) expect(host, `${path}: ${host}`).toMatch(ALLOWED_HOST_GUIDES);
      for (const key of text.match(/hb_[A-Za-z0-9]{8,}/g) ?? []) expect(key).toBe('hb_xxxxxxxx');
    },
  );
});
