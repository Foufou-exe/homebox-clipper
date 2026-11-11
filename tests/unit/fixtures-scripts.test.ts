import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anonymize, leakCheck, parseArgs } from '../../scripts/fixtures/anonymize-amazon';
import {
  FICTIONAL_DATE,
  formatFixtureDate,
  formatFixturePrice,
  reconstruct,
  replaceLabels,
  rewriteDates,
  rewriteOrigin,
  rewritePrices,
  setHtmlLang,
  variantsOf,
} from '../../scripts/fixtures/reconstruct-amazon';
import { PAGE_LOCALES } from '@/content/merchants/amazon/page-locales';
import { parseOrderDate, parsePrice } from '@/content/merchants/amazon/parse';
import { AMAZON_STORES, type AmazonStore } from '@/content/merchants/amazon/stores';
import { fixtureHtml } from './fixtures';

const store = (id: string): AmazonStore => AMAZON_STORES.find((s) => s.id === id)!;
const source = (file: string) =>
  readFileSync(resolve(__dirname, '../../scripts/fixtures', file), 'utf8');

describe('reconstruct-amazon: pure functions (R7)', () => {
  it('setHtmlLang sets <html lang> without touching the rest', () => {
    const html = '<!doctype html>\n<html lang="fr-fr">\n<body><p lang="fr">x</p></body>\n</html>';
    expect(setHtmlLang(html, 'de-de')).toBe(
      '<!doctype html>\n<html lang="de-de">\n<body><p lang="fr">x</p></body>\n</html>',
    );
  });

  it('replaceLabels replaces only the fixtureLabels at the start of a text node', () => {
    const html =
      '<span>Facture</span><span>\n  Vendu par :\n  <a>Vendeur Fictif</a></span><span>Commande effectuée le</span>' +
      '<span>Produit Facture</span><a href="/Facture">Texte fictif</a>';
    expect(replaceLabels(html, PAGE_LOCALES.de.fixtureLabels)).toBe(
      '<span>Rechnung</span><span>\n  Verkauf durch:\n  <a>Vendeur Fictif</a></span><span>Bestellt am</span>' +
        '<span>Produit Facture</span><a href="/Facture">Texte fictif</a>',
    );
  });

  it.each([
    ['fr', 'DMY', '9 novembre 2026'],
    ['de', 'DMY', '9. November 2026'],
    ['es', 'DMY', '9 de noviembre de 2026'],
    ['it', 'DMY', '9 novembre 2026'],
    ['nl', 'DMY', '9 november 2026'],
    ['en', 'DMY', '9 November 2026'],
    ['en', 'MDY', 'November 9, 2026'],
  ] as const)(
    'formatFixtureDate %s %s → %s, read back by parseOrderDate',
    (lang, order, expected) => {
      expect(formatFixtureDate(FICTIONAL_DATE, lang, order)).toBe(expected);
      expect(parseOrderDate(expected, lang, order)).toBe(FICTIONAL_DATE);
    },
  );

  it('the fictional date has a day ≤ 12 (a day/month swap is detectable, SC-002)', () => {
    const [, month, day] = FICTIONAL_DATE.split('-').map(Number);
    expect(day).toBeLessThanOrEqual(12);
    expect(day).not.toBe(month);
  });

  it.each([
    ['fr', 'EUR', '1\u202f111,11\u00a0€'],
    ['de', 'EUR', '1.111,11\u00a0€'],
    ['es', 'EUR', '1.111,11\u00a0€'],
    ['it', 'EUR', '1.111,11\u00a0€'],
    ['nl', 'EUR', '€\u00a01.111,11'],
    ['en', 'EUR', '€1,111.11'],
    ['en', 'GBP', '£1,111.11'],
    ['en', 'USD', '$1,111.11'],
  ] as const)(
    'formatFixturePrice %s %s → %j, read back by parsePrice',
    (lang, currency, expected) => {
      expect(formatFixturePrice(1111.11, lang, currency)).toBe(expected);
      expect(parsePrice(expected, lang)).toEqual({ amount: 1111.11, currency });
    },
  );

  it('rewriteDates and rewritePrices: amounts ≥ 1000 (a factor of 1000 is detectable, SC-003)', () => {
    const html =
      '<span>\n 15 mars 2024\n</span><span class="a-offscreen">11,11 €</span><span>22,22 €</span>';
    expect(rewriteDates(html, 'de', 'DMY')).toContain('9. November 2026');
    expect(rewriteDates(html, 'de', 'DMY')).not.toContain('15 mars 2024');
    const prices = rewritePrices(html, 'en', 'GBP');
    expect(prices).toContain('£1,111.11');
    expect(prices).toContain('£2,222.22');
    expect(prices).not.toContain('11,11 €');
  });

  it('rewriteOrigin rewrites the absolute amazon.fr links to the store origin', () => {
    const html =
      '<a href="https://www.amazon.fr/dp/B00FAKE001">x</a><a href="/dp/B00FAKE002">y</a>';
    expect(rewriteOrigin(html, 'https://www.amazon.de')).toBe(
      '<a href="https://www.amazon.de/dp/B00FAKE001">x</a><a href="/dp/B00FAKE002">y</a>',
    );
  });

  it('variants: main language, Amazon.de in English and Turkish, Amazon.com.be in French and Dutch', () => {
    expect(variantsOf(store('amazon.de')).map((v) => [v.htmlLang, v.suffix])).toEqual([
      ['de-de', ''],
      ['en-gb', '-en'],
      ['tr-tr', '-tr'],
    ]);
    expect(variantsOf(store('amazon.com.be')).map((v) => [v.htmlLang, v.suffix])).toEqual([
      ['fr-be', ''],
      ['nl-be', '-nl'],
    ]);
    expect(variantsOf(store('amazon.co.uk')).map((v) => v.htmlLang)).toEqual(['en-gb']);
    expect(variantsOf(store('amazon.com')).map((v) => v.htmlLang)).toEqual(['en-us']);
  });

  it('reconstruct: an Amazon.fr anonymized page becomes a German page of Amazon.de', () => {
    const [de] = variantsOf(store('amazon.de'));
    const html = reconstruct(fixtureHtml('real-order-qty.html'), de!);
    expect(html).toContain('<html lang="de-de">');
    expect(html).toContain('Verkauf durch:');
    expect(html).toContain('9. November 2026');
    expect(html).toContain('1.111,11\u00a0€');
    expect(html).not.toMatch(/Vendu par|15 mars 2024|11,11 €/);
  });
});

describe('reconstruct-amazon and anonymize-amazon: never read a raw page by themselves (source test)', () => {
  it('reconstruct-amazon.ts reads only the anonymized Amazon.fr fixtures, never raw/', () => {
    expect(source('reconstruct-amazon.ts')).not.toMatch(/['"`/]raw['"`/]/);
  });

  it('neither script logs a page value (counts and file names only)', () => {
    for (const file of ['reconstruct-amazon.ts', 'anonymize-amazon.ts']) {
      const calls = [...source(file).matchAll(/console\.\w+\(([^;]*)\);/g)].map((m) => m[1]!);
      expect(calls.length, file).toBeGreaterThan(0);
      for (const args of calls) {
        // A single string literal whose interpolations are counts or file names.
        expect(args.trim().replace(/,$/, ''), file).toMatch(/^(['"`]).*\1$/s);
        for (const [, expr] of args.matchAll(/\$\{([^}]*)\}/g)) {
          expect(expr, file).toMatch(/\.length$|^(dir|fixtureName|store\.fixturesDir)$/);
        }
      }
    }
  });
});

/** A fictional "raw" page (no real data): structure of an order page plus personal-looking values. */
const RAW = `<!doctype html><html lang="de-de"><head><script>var token = "sk-secret-123";</script><style>.x{}</style></head><body>
<div id="nav">Hallo, Erika Musterfrau</div>
<div id="orderDetails" class="a-section">
  <!-- comment with 999-1234567-7654321 -->
  <div data-component="orderDate"><span>Bestellt am 3. Februar 2025</span></div>
  <div data-component="orderId"><span>302-1234567-7654321</span></div>
  <div data-component="shippingAddress"><span>Erika Musterfrau</span><span>Heidestraße 17</span><span>51147 Köln</span></div>
  <div data-component="paymentMethod"><span>Visa endet auf 4242</span></div>
  <div data-component="orderInvoice"><span class="a-declarative" data-a-popover='{"url":"/your-orders/invoice/popover?orderId=302-1234567-7654321&amp;ref=xyz99"}'><a href="#" data-track="trk-778899">Rechnung</a></span></div>
  <div data-component="purchasedItems"><div class="a-fixed-left-grid" id="item123">
    <div data-component="itemImage"><a href="/dp/B07XJ8C8F5?ref=abc"><img src="https://m.media-amazon.com/images/I/71abcDEF+gL._SS142_.jpg" alt="Wasserkocher"></a></div>
    <div data-component="purchasedItemsRightGrid">
      <div data-component="itemTitle"><a class="a-link-normal" href="/dp/B07XJ8C8F5?ref=abc">Wasserkocher Edelstahl 1,7 L</a></div>
      <div data-component="orderedMerchant"><span>Verkauf durch: Haushaltswaren Schmidt GmbH</span></div>
      <div data-component="unitPrice"><span class="a-offscreen">34,99 €</span></div>
    </div>
  </div></div>
  <div data-component="buyerContact"><span>erika.musterfrau@example.org</span><span>+49 221 1234567</span></div>
</div></body></html>`;

describe('anonymize-amazon: allow list and leak check (R7, principle VII)', () => {
  const fixture = anonymize(RAW, { lang: 'de' });

  it('keeps the #orderDetails subtree in a <html lang> skeleton, the original language kept', () => {
    expect(fixture).toMatch(/^<!doctype html>\n<html lang="de-de">\n<body>\n/);
    expect(fixture).toContain('id="orderDetails"');
    expect(fixture).not.toMatch(/<script|<style|<!--|Hallo|nav/);
  });

  it('removes sensitive components and unknown attributes, rebuilds href, src and data-a-popover', () => {
    expect(fixture).not.toMatch(
      /shippingAddress|paymentMethod|buyerContact|data-track|alt=|item123/,
    );
    expect(fixture).toContain('href="/dp/B00FAKE001"');
    expect(fixture).toContain('src="https://m.media-amazon.com/images/I/test-1.jpg"');
    expect(fixture).toMatch(
      /data-a-popover="\{&quot;url&quot;:&quot;\/your-orders\/invoice\/popover\?orderId=999-0000000-00000\d\d&quot;\}"/,
    );
  });

  it('every text is generated in the language, generic labels kept', () => {
    expect(fixture).toContain('Rechnung');
    expect(fixture).toContain('Verkauf durch: Vendeur Fictif');
    expect(fixture).toContain('Produit fictif 1');
    expect(fixture).toContain('15. März 2024');
    expect(fixture).not.toContain('Februar 2025');
    expect(fixture).toMatch(/999-0000000-00000\d\d/);
  });

  it('a sane copy: 0 leak', () => {
    expect(leakCheck(fixture, RAW)).toEqual([]);
  });

  it.each([
    ['text', '<span>Haushaltswaren Schmidt GmbH</span>'],
    ['product name', '<span>Wasserkocher Edelstahl 1,7 L</span>'],
    ['attribute', '<span data-x="trk-778899"></span>'],
    ['ASIN', '<a href="/dp/B07XJ8C8F5"></a>'],
    ['order number', '<span>302-1234567-7654321</span>'],
    ['e-mail', '<span>erika.musterfrau@example.org</span>'],
    ['phone +49', '<span>+49 221 1234567</span>'],
    ['postal code', '<span>51147</span>'],
    ['card digits', '<span>endet auf 4242</span>'],
  ])('a contaminated copy (%s) is detected', (_kind, contamination) => {
    const dirty = fixture.replace('</body>', `${contamination}</body>`);
    expect(leakCheck(dirty, RAW).length).toBeGreaterThan(0);
  });

  it.each([
    ['+44', '+44 20 7946 0958'],
    ['+1', '+1 (555) 010-4477'],
  ])('a contaminated copy (phone %s from another raw page) is detected', (_kind, phone) => {
    const raw = RAW.replace('+49 221 1234567', phone);
    const sane = anonymize(raw, { lang: 'de' });
    expect(leakCheck(sane, raw)).toEqual([]);
    expect(
      leakCheck(sane.replace('</body>', `<span>${phone}</span></body>`), raw).length,
    ).toBeGreaterThan(0);
  });
});

describe('anonymize-amazon: structural tokens by pattern only (M1)', () => {
  const raw = RAW.replace('<div id="orderDetails" class="a-section">', '<div id="orderDetails" class="a-section Dupont-Marie">')
    .replace('<div data-component="orderDate">', '<div data-component="orderDate" id="Dupont-Marie"><span class="x-erika-musterfrau"></span>');
  const fixture = anonymize(raw, { lang: 'de' });

  it('an id or class that is not an Amazon structural token is dropped', () => {
    expect(fixture).not.toMatch(/Dupont-Marie|x-erika-musterfrau/);
    expect(fixture).toContain('id="orderDetails"');
    expect(fixture).toContain('class="a-section"');
    expect(leakCheck(fixture, raw)).toEqual([]);
  });

  it.each([
    ['id', '<div id="Dupont-Marie"></div>'],
    ['class', '<div class="a-section Dupont-Marie"></div>'],
    ['data-component', '<div data-component="Dupont-Marie"></div>'],
  ])('a contaminated copy (%s copied from the raw page) is detected', (_kind, contamination) => {
    expect(leakCheck(fixture.replace('</body>', `${contamination}</body>`), raw)).toContain('Dupont-Marie');
  });
});

describe('anonymize-amazon: command-line arguments (M2, M3)', () => {
  it('valid arguments', () => {
    expect(parseArgs(['amazon-de', 'order-1.html', 'real-order-single.html', 'de'])).toEqual({
      dir: 'amazon-de',
      rawName: 'order-1.html',
      fixtureName: 'real-order-single.html',
      lang: 'de',
    });
    expect(parseArgs(['amazon-com-be', 'x.html', 'real-order-multi.html'])?.lang).toBe('fr');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'tr'])('language %j refused', (lang) => {
    expect(parseArgs(['amazon-de', 'x.html', 'real-order-single.html', lang])).toBeNull();
  });

  it.each(['../amazon-de', 'amazon-de/../..', '/tmp', 'amazon_de', 'Amazon-de', 'raw', ''])('directory %j refused', (dir) => {
    expect(parseArgs([dir, 'x.html', 'real-order-single.html', 'de'])).toBeNull();
  });

  it.each(['../x.html', 'sub/x.html', '/etc/passwd', '..', '.hidden.html', ''])('raw file name %j refused', (name) => {
    expect(parseArgs(['amazon-de', name, 'real-order-single.html', 'de'])).toBeNull();
  });

  it.each(['order.html', 'real-../x.html', 'reconstructed-order-single.html'])('fixture name %j refused', (name) => {
    expect(parseArgs(['amazon-de', 'x.html', name, 'de'])).toBeNull();
  });
});
