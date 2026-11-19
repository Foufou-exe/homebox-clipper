import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the advanced duplicate detection (spec 015, Q-U8). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('docs/wiki/Usage.md, "Duplicates" section (015)', () => {
  const doc = prose('docs/wiki/Usage.md');
  const section = doc.slice(doc.indexOf('## Duplicates'), doc.indexOf('## No invoice'));

  it('the section exists', () => {
    expect(section.length).toBeGreaterThan(100);
  });

  it('describes the certain duplicate and the similar items', () => {
    expect(section).toMatch(/certain duplicate/i);
    expect(section).toMatch(/similar/i);
  });

  it('the user chooses: "Create anyway" or "Cancel"', () => {
    expect(section).toMatch(/Create anyway/);
    expect(section).toMatch(/Cancel/);
  });

  it('covers the whole inventory, including items added by hand or from another store', () => {
    expect(section).toMatch(/by hand|manual/i);
    expect(section).toMatch(/another (store|merchant)/i);
  });

  it('products without an order number are checked too', () => {
    expect(section).toMatch(/without an order number/i);
  });

  it('at most 5 similar items per product', () => {
    expect(section).toMatch(/\b5\b|five/i);
  });

  it('the detection is an aid, not a guarantee', () => {
    expect(section).toMatch(/not a guarantee|does not guarantee|cannot guarantee/i);
  });

  it('a failed check stays visible until the result', () => {
    expect(section).toMatch(/The duplicate check could not be performed\./);
    expect(section).toMatch(/result/i);
  });
});

describe('docs/wiki/Troubleshooting-and-FAQ.md (015)', () => {
  const lines = read('docs/wiki/Troubleshooting-and-FAQ.md').split('\n');
  const row = (code: string) => lines.find((l) => l.includes(`\`${code}\``)) ?? '';

  it('the DUPLICATE_SUSPECTED row mentions close names', () => {
    expect(row('DUPLICATE_SUSPECTED')).toMatch(/close name|similar name/i);
  });

  it('the DUPLICATE_CHECK_FAILED row says the message stays visible on the result screen', () => {
    expect(row('DUPLICATE_CHECK_FAILED')).toMatch(/result/i);
  });
});

describe('docs/wiki/Architecture.md (015)', () => {
  const doc = prose('docs/wiki/Architecture.md');

  it('mentions similarity.ts and the word searches', () => {
    expect(doc).toMatch(/similarity\.ts/);
    expect(doc).toMatch(/word/i);
  });
});

describe('015 docs: no new stored data or recipient announced', () => {
  it.each([
    'docs/wiki/Usage.md',
    'docs/wiki/Troubleshooting-and-FAQ.md',
    'docs/wiki/Architecture.md',
  ])('%s does not announce a new recipient or new stored data', (path) => {
    const doc = prose(path);
    expect(doc).not.toMatch(/new recipient/i);
    expect(doc).not.toMatch(/similar items? (are|is) (stored|saved)/i);
  });
});

describe('PRIVACY.md / PRIVACY.fr.md: duplicate search by words of the name (015)', () => {
  it('EN: up to 3 words of the name searched on the HomeBox instance at the click, even if cancelled, nothing stored or logged', () => {
    const en = prose('PRIVACY.md');
    expect(en).toMatch(/up to 3 words of the name of each checked product/);
    expect(en).toMatch(/as soon as you click "Add"/);
    expect(en).toMatch(/even if you then cancel/);
    expect(en).toMatch(/nothing is stored or logged/);
    expect(en).toMatch(/no other recipient/);
  });

  it('FR: the same elements in French', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toMatch(/jusqu'à 3 mots du nom de chaque produit coché/);
    expect(fr).toMatch(/dès que vous cliquez sur « Ajouter »/);
    expect(fr).toMatch(/même si vous annulez ensuite/);
    expect(fr).toMatch(/rien n'est stocké ni journalisé/);
    expect(fr).toMatch(/aucun autre destinataire/);
  });
});
