import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the local import history (012, FR-013, Q-U27). */
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
/** Text with line breaks folded, for sentences wrapped in the Markdown source. */
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('import history documentation (FR-013)', () => {
  it('PRIVACY.md: limits, encryption with the passphrase, locked, unrecoverable, how to erase', () => {
    const doc = prose('PRIVACY.md');
    expect(doc).toContain('200');
    expect(doc).toContain('12 months');
    expect(doc).toMatch(/import history/i);
    expect(doc).toMatch(/encrypted with your passphrase/i);
    expect(doc).toMatch(/unreadable while the extension is locked/i);
    expect(doc).toMatch(/cannot be recovered/i);
    for (const way of ['Delete', 'Clear all', 'turn', 'Delete settings']) expect(doc).toContain(way);
  });

  it('PRIVACY.fr.md: same elements in French', () => {
    const doc = prose('PRIVACY.fr.md');
    expect(doc).toContain('200');
    expect(doc).toContain('12 mois');
    expect(doc).toMatch(/historique des imports/i);
    expect(doc).toMatch(/chiffré avec votre phrase de passe/i);
    expect(doc).toMatch(/illisible tant que l’extension est verrouillée/i);
    expect(doc).toMatch(/irrécupérable/i);
    for (const way of ['Supprimer', 'Tout effacer', 'désactiv', 'Supprimer la configuration']) expect(doc).toContain(way);
  });

  it('store listing: the storage justification mentions the local history (EN and FR)', () => {
    const doc = read('docs/store/listing.md');
    expect(doc).toMatch(/storage[\s\S]{0,800}import history/i);
    expect(doc).toMatch(/historique des imports/i);
  });

  it('store listing: no "data usage" checkbox changes compared with main', () => {
    // Category and "Tick?" columns of the "Data usage" table, plus the checklist boxes.
    const boxes = (text: string) => [
      ...text
        .slice(text.indexOf('### Data usage'))
        .split('\n')
        .filter((l) => /^\| [A-Z]/.test(l))
        .map((l) => l.split('|').slice(1, 3).map((c) => c.trim()).join(' = ')),
      ...text.split('\n').filter((l) => /^\s*[-*] \[[ xX]\]/.test(l)),
    ];
    let before: string;
    try {
      before = execFileSync('git', ['show', 'main:docs/store/listing.md'], { cwd: root, encoding: 'utf8' });
    } catch {
      return; // no git history available (archive): the check is skipped
    }
    expect(boxes(before)).toContain('Web history = No');
    expect(boxes(read('docs/store/listing.md'))).toEqual(boxes(before));
  });

  it('wiki: Security-and-privacy.md and Usage.md have an "Import history" section', () => {
    expect(read('docs/wiki/Security-and-privacy.md')).toMatch(/^#{2,3} Import history/m);
    expect(read('docs/wiki/Usage.md')).toMatch(/^#{2,3} Import history/m);
  });

  it('Usage.md: the history section comes before "Recovery after an error"', () => {
    const usage = read('docs/wiki/Usage.md');
    const history = usage.search(/^#{2,3} Import history/m);
    const recovery = usage.search(/^#{2,3} Recovery after an error/m);
    expect(history).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(history);
  });

  it('pruning is described as it really runs (history opened or import, unlocked), never "at the next unlock"', () => {
    expect(prose('docs/wiki/Security-and-privacy.md')).not.toMatch(/next unlock/i);
    expect(prose('docs/wiki/Security-and-privacy.md')).toMatch(/when the history is opened and at each new import/);
    expect(prose('PRIVACY.md')).not.toMatch(/deleted automatically/i);
    expect(prose('PRIVACY.md')).toMatch(/when you open the history or import a purchase/);
    expect(prose('PRIVACY.fr.md')).not.toMatch(/supprimées automatiquement/i);
    expect(prose('PRIVACY.fr.md')).toMatch(/à l'ouverture de l'historique ou lors d'un import/);
  });
});
