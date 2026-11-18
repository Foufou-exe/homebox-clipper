import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the automatic lock and of the updates (013, FR-021, Q-U13). */
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
/** Text with line breaks folded, for sentences wrapped in the Markdown source. */
const prose = (path: string) => read(path).replace(/\s+/g, ' ');
const fromMain = (path: string): string | null => {
  try {
    return execFileSync('git', ['show', `main:${path}`], { cwd: root, encoding: 'utf8' });
  } catch {
    return null; // no git history available (archive): the comparison is skipped
  }
};

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function effectiveDate(text: string, months: string[], label: RegExp): number {
  const m = text.match(label);
  expect(m, 'effective date').not.toBeNull();
  const [, day, month, year] = m!;
  return Date.UTC(Number(year), months.indexOf(month!), Number(day));
}

describe('automatic lock and updates documentation (013, FR-021)', () => {
  it('PRIVACY.md: the five lock choices, why no "never", key forgotten at browser close, no network request for updates', () => {
    const doc = prose('PRIVACY.md');
    expect(doc).toMatch(/automatic lock/i);
    for (const choice of ['when the browser closes', '15 minutes', '1 hour', '4 hours', 'every time the extension is opened']) {
      expect(doc.toLowerCase(), choice).toContain(choice.toLowerCase());
    }
    expect(doc).toMatch(/no “never” option|no "never" option/i);
    expect(doc).toMatch(/forgotten when the browser closes/i);
    expect(doc).toMatch(/no network request/i);
    for (const key of ['lockSettings', 'updateNotice', 'updateReady', 'homeboxActivity']) expect(doc, key).toContain(key);
  });

  it('PRIVACY.fr.md: the same elements in French', () => {
    const doc = prose('PRIVACY.fr.md');
    expect(doc).toMatch(/verrouillage automatique/i);
    for (const choice of ['à la fermeture du navigateur', '15 minutes', '1 heure', '4 heures', 'à chaque ouverture de l’extension']) {
      expect(doc.toLowerCase(), choice).toContain(choice.toLowerCase());
    }
    expect(doc).toMatch(/« jamais »/);
    expect(doc).toMatch(/oubliée à la fermeture du navigateur/i);
    expect(doc).toMatch(/aucun appel réseau/i);
    for (const key of ['lockSettings', 'updateNotice', 'updateReady', 'homeboxActivity']) expect(doc, key).toContain(key);
  });

  it('PRIVACY.md and PRIVACY.fr.md: effective date later than the one on main, and the same in both', () => {
    const enLabel = /Effective date: \*\*(\d{1,2}) ([A-Z][a-z]+) (\d{4})\*\*/;
    const frLabel = /Date d'effet : \*\*(\d{1,2}) ([a-zéû]+) (\d{4})\*\*/;
    const en = effectiveDate(read('PRIVACY.md'), EN_MONTHS, enLabel);
    const fr = effectiveDate(read('PRIVACY.fr.md'), FR_MONTHS, frLabel);
    expect(en).toBe(fr);
    const before = fromMain('PRIVACY.md');
    if (before !== null) expect(en).toBeGreaterThan(effectiveDate(before, EN_MONTHS, enLabel));
  });

  it('store listing: the storage justification mentions the lock setting and no network call for updates (EN and FR)', () => {
    const doc = read('docs/store/listing.md');
    const storage = doc.slice(doc.indexOf('**storage**'), doc.indexOf('**', doc.indexOf('**storage**') + 12));
    expect(storage).toMatch(/lock setting/i);
    expect(storage).toMatch(/réglage de verrouillage/i);
    expect(storage).toMatch(/no network (request|call)/i);
    expect(storage).toMatch(/aucun appel réseau/i);
    const en = doc.slice(doc.indexOf('PRIVACY AND SECURITY'), doc.indexOf('CONFIDENTIALITÉ ET SÉCURITÉ'));
    const fr = doc.slice(doc.indexOf('CONFIDENTIALITÉ ET SÉCURITÉ'));
    expect(en).toMatch(/lock/i);
    expect(en).toMatch(/never/i);
    expect(fr).toMatch(/verrouillage/i);
    expect(fr).toMatch(/jamais/i);
  });

  it('store listing: no permission and no "data usage" checkbox changes compared with main', () => {
    const before = fromMain('docs/store/listing.md');
    if (before === null) return;
    const now = read('docs/store/listing.md');
    const boxes = (text: string) => [
      ...text
        .slice(text.indexOf('### Data usage'))
        .split('\n')
        .filter((l) => /^\| [A-Z]/.test(l))
        .map((l) => l.split('|').slice(1, 3).map((c) => c.trim()).join(' = ')),
      ...text.split('\n').filter((l) => /^\s*[-*] \[[ xX]\]/.test(l)),
    ];
    expect(boxes(now)).toEqual(boxes(before));
    const permissions = (text: string) => [...text.matchAll(/^\*\*([a-zA-Z_]+)\*\*\s*$/gm)].map((m) => m[1]);
    expect(permissions(now)).toEqual(permissions(before));
  });

  it('no remaining "once per browser session" claim in the documentation and the catalogs', () => {
    for (const path of ['PRIVACY.md', 'PRIVACY.fr.md', 'README.md', 'README.fr.md', 'docs/wiki/Troubleshooting-and-FAQ.md', 'docs/wiki/Configuration.md', 'docs/wiki/Usage.md', 'src/locales/en.yml', 'src/locales/fr.yml']) {
      expect(prose(path), path).not.toMatch(/once per (browser )?session|per browser session|une fois par session/i);
    }
  });
});
