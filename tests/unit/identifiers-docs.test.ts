import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCatalog } from './i18n-harness';

/** Spec 027 (FR-016, FR-017, Q-U2): the product page reading is documented; the texts exist in both languages. */
const doc = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const KEYS = [
  'identifiers.legend',
  'identifiers.manufacturer',
  'identifiers.modelNumber',
  'identifiers.serialNumber',
  'identifiers.serialHelp',
  'identifiers.notFound',
  'identifiers.templateNote',
  'identifiers.tooLong',
];

describe('identifiers documentation (spec 027)', () => {
  it('PRIVACY.md: product page, no cookies, no API key, never replaced, not logged', () => {
    const text = doc('PRIVACY.md');
    expect(text).toContain('**product page**');
    expect(text).toContain('without cookies or');
    expect(text).toContain('`manufacturer`, `modelNumber`, `serialNumber`');
    expect(text).toContain('never replacing');
    expect(text).toContain('contains no API key and no HomeBox data');
    expect(text).toContain('product page of each product of that order');
  });

  it('PRIVACY.fr.md: page produit, sans cookie, sans clé API, jamais remplacée, pas journalisée', () => {
    const text = doc('PRIVACY.fr.md');
    expect(text).toContain('**page produit**');
    expect(text).toContain('sans cookie ni référent');
    expect(text).toContain('`manufacturer`, `modelNumber`, `serialNumber`');
    expect(text).toContain('sans jamais remplacer');
    expect(text).toContain('ne contient ni clé API ni donnée HomeBox');
    expect(text).toContain('page produit Amazon de chaque produit de cette commande');
  });

  it('README en/fr, wiki and store listings describe the feature', () => {
    expect(doc('README.md')).toContain('**Manufacturer, model and serial number**');
    expect(doc('README.fr.md')).toContain('**Fabricant, modèle et numéro de série**');
    expect(doc('docs/site/src/content/docs/usage.md')).toContain('## Manufacturer, model and serial number'); // ADAPTED (028): path moved to the documentation site
    expect(doc('docs/site/src/content/docs/security-and-privacy.md')).toContain( // ADAPTED (028): path moved to the documentation site
      '## The product page (manufacturer and model)',
    );
    expect(doc('docs/site/src/content/docs/contributing/architecture.md')).toContain( // ADAPTED (028): path moved to the documentation site
      '### Manufacturer, model and serial number (spec 027)',
    );
    for (const listing of ['docs/store/listing.md', 'docs/store/amo-listing.md']) {
      const text = doc(listing);
      expect(text, listing).toContain(
        'Manufacturer and model number read on the Amazon product page',
      );
      expect(text, listing).toContain(
        'Fabricant et numéro de modèle lus sur la page produit Amazon',
      );
    }
  });

  it('the privacy policies are effective from 23 November 2026 or later (floor)', () => {
    const months: Record<string, number> = { November: 10, December: 11 };
    const en = /Effective date: \*\*(\d{1,2}) ([A-Z][a-z]+) (\d{4})\*\*/.exec(doc('PRIVACY.md'));
    expect(en).not.toBeNull();
    const date = Date.UTC(Number(en![3]), months[en![2]!] ?? 12, Number(en![1]));
    expect(date).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 23));
  });

  it('every identifiers.* text exists in English and French, non-empty', () => {
    const en = loadCatalog('en');
    const fr = loadCatalog('fr');
    for (const key of KEYS) {
      expect(en[key], key).toBeTruthy();
      expect(fr[key], key).toBeTruthy();
    }
    expect(
      Object.keys(en)
        .filter((k) => k.startsWith('identifiers.'))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(
      Object.keys(fr)
        .filter((k) => k.startsWith('identifiers.'))
        .sort((a, b) => a.localeCompare(b)),
    );
  });
});
