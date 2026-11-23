import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCatalog } from './i18n-harness';

/** Documentation of the order page link (spec 025, FR-017, FR-018, Q-U4). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('PRIVACY.md and PRIVACY.fr.md', () => {
  it('EN: link stored in HomeBox, off by default, option per instance erased with it, no address in the logs', () => {
    const en = prose('PRIVACY.md');
    expect(en).toContain('orderLinkByInstance');
    expect(en).toMatch(/link to the order page/i);
    expect(en).toMatch(/off by default/i);
    expect(en).toMatch(/stored in HomeBox/i);
    expect(en).toMatch(/points to the merchant's website/i);
    expect(en).toMatch(/orderLinkByInstance`?\)?,? erased with the instance or the settings/i);
    expect(en).toMatch(/no link address or title is written to the logs/i);
  });

  it('FR: same statements', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toContain('orderLinkByInstance');
    expect(fr).toMatch(/lien vers la page de commande/i);
    expect(fr).toMatch(/désactivée par défaut/i);
    expect(fr).toMatch(/enregistré dans HomeBox/i);
    expect(fr).toMatch(/site du marchand/i);
    expect(fr).toMatch(/effacé avec l'instance ou les réglages/i);
    expect(fr).toMatch(/aucune adresse ni aucun titre de lien[^.]*journaux/i);
  });
});

describe('wiki', () => {
  it('Configuration: the option, off by default, stored in HomeBox', () => {
    const doc = prose('docs/wiki/Configuration.md');
    expect(doc).toContain('## Link to the order page');
    expect(doc).toMatch(/Add a link to the order page/);
    expect(doc).toMatch(/off by default/i);
    expect(doc).toMatch(/stored in HomeBox/i);
    expect(doc).toContain('orderLinkByInstance');
  });

  it('Usage: the box, its default, the address shown, the result and the retry', () => {
    const doc = prose('docs/wiki/Usage.md');
    expect(doc).toContain('## Link to the order page');
    expect(doc).toMatch(/ticked by default/i);
    expect(doc).toMatch(/Retry the order link/);
    expect(doc).toMatch(/notes[^.]*stay the same/i);
  });

  it('Architecture: step, route, body, guard, messages, storage, codes, unchanged call sequence', () => {
    const doc = prose('docs/wiki/Architecture.md');
    expect(doc).toContain('POST /api/v1/entities/{id}/attachments/external');
    expect(doc).toContain('steps.orderLink');
    expect(doc).toContain('orderLinkAttempted');
    for (const m of ['order-link/get', 'order-link/set']) expect(doc).toContain(`\`${m}\``);
    for (const code of ['ORDER_LINK_FAILED', 'ORDER_LINK_UNSUPPORTED']) expect(doc).toContain(code);
    expect(doc).toContain('orderLinkByInstance');
    expect(doc).toContain('orchestrator-call-sequence');
    expect(doc).toMatch(
      /reads the item again[^.]*never creates a second link|never creates a second link/i,
    );
  });

  it('Security-and-privacy: stored in HomeBox, per-instance option row', () => {
    const doc = prose('docs/wiki/Security-and-privacy.md');
    expect(doc).toContain('orderLinkByInstance');
    expect(doc).toMatch(/link to the order page[^.]*stored in HomeBox/i);
  });

  it('Troubleshooting: both codes', () => {
    const doc = prose('docs/wiki/Troubleshooting-and-FAQ.md');
    expect(doc).toContain('`ORDER_LINK_FAILED`');
    expect(doc).toContain('`ORDER_LINK_UNSUPPORTED`');
  });
});

describe('README, store listings', () => {
  it.each(['README.md', 'README.fr.md'])('%s lists the option', (file) => {
    expect(read(file)).toMatch(/order page|page de commande/);
    expect(read(file)).toMatch(/lien|link/i);
  });

  it('listing.md and amo-listing.md: the feature and where the link is stored', () => {
    for (const file of ['docs/store/listing.md', 'docs/store/amo-listing.md']) {
      const doc = prose(file);
      expect(doc).toMatch(/link to the order page[^.]*stored in HomeBox/i);
      expect(doc).toMatch(/lien vers la page de commande[^.]*enregistré dans HomeBox/i);
    }
    expect(prose('docs/store/listing.md')).toMatch(/link setting of each instance/i);
    expect(prose('docs/store/listing.md')).toMatch(
      /réglage du lien de commande de chaque instance/i,
    );
  });
});

describe('locales (en and fr synchronized)', () => {
  const en = loadCatalog('en');
  const fr = loadCatalog('fr');
  const keys = Object.keys(en).filter(
    (k) =>
      k.startsWith('orderLink.') || k.includes('OrderLink') || k.startsWith('error.ORDER_LINK'),
  );

  it('the same keys exist in both languages and none is empty', () => {
    expect(keys.length).toBeGreaterThanOrEqual(13);
    for (const k of keys) {
      expect(fr[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
    for (const k of Object.keys(fr).filter(
      (x) =>
        x.startsWith('orderLink.') || x.includes('OrderLink') || x.startsWith('error.ORDER_LINK'),
    ))
      expect(en[k], k).toBeDefined();
  });

  it('the option and field texts mention HomeBox', () => {
    for (const lang of [en, fr]) {
      expect(lang['orderLink.optionHelp']).toContain('HomeBox');
      expect(lang['orderLink.fieldHelp']).toContain('HomeBox');
    }
  });
});
