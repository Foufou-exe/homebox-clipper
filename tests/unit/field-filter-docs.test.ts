import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the custom-field duplicate filter (spec 020, FR-015). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\s+/g, ' ');

describe('field filter docs (020)', () => {
  it('Usage.md, Duplicates section, mentions the order number custom field', () => {
    const doc = read('docs/wiki/Usage.md');
    const section = doc.slice(doc.indexOf('## Duplicates'), doc.indexOf('## No invoice'));
    expect(section).toMatch(/order number custom field/);
    expect(section).toMatch(/incomplete/);
  });

  it('Architecture.md mentions the fields filter and the confirmation reads', () => {
    const doc = read('docs/wiki/Architecture.md');
    expect(doc).toContain('/api/v1/entities?fields=');
    expect(doc).toMatch(/at most 5 reads/);
  });

  it('PRIVACY.md mentions the custom-field filter and keeps the 015 sentences', () => {
    const doc = read('PRIVACY.md');
    expect(doc).toMatch(/custom-field filter/);
    expect(doc).toMatch(/nothing is stored or logged/);
    expect(doc).toMatch(/no other recipient/);
  });

  it('PRIVACY.fr.md mentions the field filter and keeps the 015 sentences', () => {
    const doc = read('PRIVACY.fr.md');
    expect(doc).toMatch(/filtre de champ/);
    expect(doc).toMatch(/rien n'est stocké ni journalisé/);
    expect(doc).toMatch(/aucun autre destinataire/);
  });
});
