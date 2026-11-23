import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the order fields as HomeBox custom fields (spec 019, FR-035, Q-U6). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('PRIVACY.md and PRIVACY.fr.md', () => {
  it('EN: option and three names per instance, erased with it; written only to the chosen instance; values only with the import; names read, never values; no log', () => {
    const en = prose('PRIVACY.md');
    expect(en).toContain('orderFieldsByInstance');
    expect(en).toMatch(
      /order-fields setting of each instance \(the option and the three field names/i,
    );
    expect(en).toMatch(/orderFieldsByInstance`?\)?,? erased with the instance or the settings/i);
    expect(en).toMatch(
      /order fields \(order number, merchant, order page address\) are written only to the HomeBox instance you chose, after your confirmation/i,
    );
    expect(en).toMatch(/their values are kept only with the import in progress/i);
    expect(en).toMatch(
      /names of the existing custom fields[^.]*suggestions[^.]*never their values[^.]*never kept/i,
    );
    expect(en).toMatch(/no field name or field value[^.]*logs/i);
  });

  it('FR: same statements', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toContain('orderFieldsByInstance');
    expect(fr).toMatch(
      /réglage des champs de commande de chaque instance \(l'option et les trois noms de champs/i,
    );
    expect(fr).toMatch(/effacé avec l'instance ou les réglages/i);
    expect(fr).toMatch(
      /champs de commande \(numéro de commande, marchand, adresse de la page de commande\) sont écrits uniquement dans l'instance HomeBox choisie, après votre confirmation/i,
    );
    expect(fr).toMatch(/leurs valeurs ne sont conservées qu'avec l'import en cours/i);
    expect(fr).toMatch(
      /noms des champs personnalisés existants[^.]*suggestions[^.]*jamais leurs valeurs[^.]*jamais conservés/i,
    );
    expect(fr).toMatch(/aucun nom ni valeur de champ[^.]*journaux/i);
  });
});

describe('docs/wiki/Architecture.md', () => {
  const doc = prose('docs/site/src/content/docs/contributing/architecture.md'); // ADAPTED (028): path moved to the documentation site
  it('storage.local table, messages, field names route, read-back, unchanged call sequence, error codes', () => {
    const storageRow = doc.slice(doc.indexOf('| `storage.local` |'));
    expect(storageRow.slice(0, 3500)).toContain('orderFieldsByInstance');
    for (const m of ['order-fields/get', 'order-fields/set', 'order-fields/names'])
      expect(doc).toContain(`\`${m}\``);
    expect(doc).toContain('GET /api/v1/entities/fields');
    expect(doc).toMatch(
      /order fields[^.]*reads the item again|reads the item again[^.]*order fields/i,
    );
    expect(doc).toContain('orchestrator-call-sequence');
    for (const code of ['ORDER_FIELDS_FAILED', 'FIELD_NAMES_UNAVAILABLE'])
      expect(doc).toContain(code);
  });
});

describe('docs/wiki/Security-and-privacy.md', () => {
  it('a row orderFieldsByInstance (option and names, erased with the instance)', () => {
    const row = read('docs/site/src/content/docs/security-and-privacy.md') // ADAPTED (028): path moved to the documentation site
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes('orderFieldsByInstance'));
    expect(row).toBeDefined();
    expect(row).toMatch(/option and the three field names/i);
    expect(row).toMatch(/erased with the instance/i);
  });
});

describe('docs/wiki/Usage.md', () => {
  it('order fields section, single number entry, merchant and URL without the notes, empty value, byte limits, template, result and retry', () => {
    const doc = prose('docs/site/src/content/docs/usage.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toMatch(/Order fields/);
    expect(doc).toMatch(/order number[^.]*single entry|single entry[^.]*order number/i);
    expect(doc).toMatch(/merchant and the order URL[^.]*without changing the notes/i);
    expect(doc).toMatch(/empty value[^.]*not created/i);
    expect(doc).toMatch(/255 bytes/);
    expect(doc).toMatch(/500 bytes/);
    expect(doc).toMatch(/template[^.]*same name[^.]*merged|merged[^.]*template[^.]*same name/i);
    expect(doc).toMatch(/another type[^.]*not created/i);
    expect(doc).toMatch(/« Order fields » step/i);
    expect(doc).toMatch(/retry/i);
  });
});

describe('docs/wiki/Configuration.md', () => {
  it('option per instance off by default, three editable names, suggestions when unlocked, default names', () => {
    const doc = prose('docs/site/src/content/docs/configuration.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toMatch(/Save the order as custom fields/);
    expect(doc).toMatch(/off by default/i);
    expect(doc).toMatch(/three field names/i);
    expect(doc).toMatch(/suggest[^.]*unlocked|unlocked[^.]*suggest/i);
    for (const name of ['Order number', 'Merchant', 'Order URL']) expect(doc).toContain(name);
  });
});

describe('no real address nor key-like value in the order fields documentation', () => {
  it.each([
    'PRIVACY.md',
    'PRIVACY.fr.md',
    'docs/site/src/content/docs/contributing/architecture.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/security-and-privacy.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/usage.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/configuration.md', // ADAPTED (028): path moved to the documentation site
  ])('%s', (path) => {
    const doc = read(path);
    expect(doc).not.toMatch(/hb_[A-Za-z0-9]{12,}/);
    // Only fictitious order numbers (000-… or 999-…).
    for (const [n] of doc.matchAll(/\b\d{3}-\d{7}-\d{7}\b/g))
      expect(n).toMatch(/^(000|999)-0000000-/);
  });
});
