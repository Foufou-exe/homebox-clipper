import { Window } from 'happy-dom';
import { PAGE_LOCALES } from '@/content/merchants/amazon/page-locales';
import {
  parseOrderDate,
  parsePrice,
  parseSeller,
  resolvePageLanguage,
} from '@/content/merchants/amazon/parse';
import {
  AMAZON_STORES,
  type AmazonStore,
  type PageLanguage,
} from '@/content/merchants/amazon/stores';

const LANGS = Object.keys(PAGE_LOCALES) as PageLanguage[];
const store = (id: string): AmazonStore => AMAZON_STORES.find((s) => s.id === id)!;
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '');

describe('parseOrderDate (contracts/page-parsers.md, FR-004, SC-002)', () => {
  it.each([
    ['Commandé le 1er févr. 2026', 'fr', 'DMY', '2026-02-01'],
    ['Bestellt am 9. November 2026', 'de', 'DMY', '2026-11-09'],
    ['9. März 2026', 'de', 'DMY', '2026-03-09'],
    ['9. Nov. 2026', 'de', 'DMY', '2026-11-09'],
    ['Pedido realizado el 9 de noviembre de 2026', 'es', 'DMY', '2026-11-09'],
    ['9 nov 2026', 'es', 'DMY', '2026-11-09'],
    ['Ordine effettuato il 9 novembre 2026', 'it', 'DMY', '2026-11-09'],
    ['Besteld op 9 mrt. 2026', 'nl', 'DMY', '2026-03-09'],
    ['Ordered on November 9, 2026', 'en', 'MDY', '2026-11-09'],
    ['Order placed 9 November 2026', 'en', 'DMY', '2026-11-09'],
    ['November 9, 2026', 'en', 'DMY', '2026-11-09'],
    ['09/11/2026', 'en', 'MDY', '2026-09-11'],
    ['09/11/2026', 'en', 'DMY', '2026-11-09'],
    ['9.11.2026', 'de', 'DMY', '2026-11-09'],
  ] as const)('%j (%s, %s) → %s', (text, lang, order, expected) => {
    expect(parseOrderDate(text, lang, order)).toBe(expected);
  });

  it.each([
    ['13/25/2026', 'en', 'MDY'],
    ['25/13/2026', 'en', 'DMY'],
    ['9 Kasım 2026', 'de', 'DMY'],
    ['31 février 2026', 'fr', 'DMY'],
    ['22 brumaire 2026', 'fr', 'DMY'],
    ['hier', 'fr', 'DMY'],
    ['', 'fr', 'DMY'],
    ['Zugestellt am 12. November', 'de', 'DMY'],
    ['9 noviembre 2026', 'de', 'DMY'],
  ] as const)(
    '%j (%s, %s) → null (never the other order, never another language)',
    (text, lang, order) => {
      expect(parseOrderDate(text, lang, order)).toBeNull();
    },
  );

  it('a day ≤ 12 is never swapped: 03/04/2026 depends only on the store order', () => {
    expect(parseOrderDate('03/04/2026', 'en', 'MDY')).toBe('2026-03-04');
    expect(parseOrderDate('03/04/2026', 'en', 'DMY')).toBe('2026-04-03');
  });
});

describe('month tables against Intl (Q-U3)', () => {
  it.each(LANGS)('%s: each long month name of Intl is in the table', (lang) => {
    for (let m = 0; m < 12; m += 1) {
      const name = new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2026, m, 15)),
      );
      expect(PAGE_LOCALES[lang].months[normalize(name)], `${lang} ${name}`).toBe(m + 1);
    }
  });

  it.each(LANGS)('%s: decimal separator consistent with Intl.NumberFormat', (lang) => {
    const decimal = new Intl.NumberFormat(lang)
      .formatToParts(1234.5)
      .find((p) => p.type === 'decimal')?.value;
    expect(PAGE_LOCALES[lang].decimalSeparator).toBe(decimal);
  });

  it('only English accepts "month day, year"', () => {
    for (const lang of LANGS) expect(PAGE_LOCALES[lang].monthDayYear, lang).toBe(lang === 'en');
    for (const lang of LANGS) expect(PAGE_LOCALES[lang].dayMonthYear, lang).toBe(true);
  });
});

describe('parsePrice (FR-005, SC-003)', () => {
  it.each([
    ['1 299,99 €', 'fr', 1299.99, 'EUR'],
    ['1\u00a0299,99\u00a0€', 'fr', 1299.99, 'EUR'],
    ['1\u202f299,99\u00a0€', 'fr', 1299.99, 'EUR'],
    ['1.299,99 €', 'de', 1299.99, 'EUR'],
    ['EUR 12,00', 'fr', 12, 'EUR'],
    ['0,00 €', 'fr', 0, 'EUR'],
    ['$15.00', 'fr', 15, 'USD'],
    ['£8.50', 'fr', 8.5, 'GBP'],
    ['£1,299.99', 'en', 1299.99, 'GBP'],
    ['$1,299.99', 'en', 1299.99, 'USD'],
    ['£1,299', 'en', 1299, 'GBP'],
    ['1.299 €', 'de', 1299, 'EUR'],
    ['€12.99', 'en', 12.99, 'EUR'],
    ['12.99 €', 'de', 12.99, 'EUR'],
    ['12,99 €', 'it', 12.99, 'EUR'],
    ['€ 1.111,11', 'nl', 1111.11, 'EUR'],
    ['1.111,11 €', 'es', 1111.11, 'EUR'],
    ['1.234.567,89 €', 'de', 1234567.89, 'EUR'],
    ['$1,234,567', 'en', 1234567, 'USD'],
    ['1.111,11 €', 'unknown', 1111.11, 'EUR'],
  ] as const)('%j (%s) → %d %s', (text, lang, amount, currency) => {
    expect(parsePrice(text, lang)).toEqual({ amount, currency });
  });

  it.each([
    ['£1.299', 'en'],
    ['1,299 €', 'fr'],
    ['1,299 €', 'de'],
    ['1,299 €', 'unknown'],
    ['1.299 €', 'unknown'],
    ['', 'fr'],
    ['Gratuit', 'fr'],
    ['€', 'de'],
    ['1299', 'en'],
    ["CHF 1'299.00", 'de'],
    ['CHF 12.50', 'fr'],
  ] as const)('%j (%s) → null (ambiguous or no currency, never ×1000 or ÷1000)', (text, lang) => {
    expect(parsePrice(text, lang)).toBeNull();
  });
});

describe('parseSeller (R2.5)', () => {
  it.each([
    ['Vendu par : Vendeur Fictif', 'fr', 'Vendeur Fictif'],
    ['Verkauf durch: Vendeur Fictif', 'de', 'Vendeur Fictif'],
    ['Verkäufer: Vendeur Fictif', 'de', 'Vendeur Fictif'],
    ['Sold by: Vendeur Fictif', 'en', 'Vendeur Fictif'],
    ['Vendido por Vendeur Fictif', 'es', 'Vendeur Fictif'],
    ['Venduto da: Vendeur Fictif', 'it', 'Vendeur Fictif'],
    ['Verkocht door: Vendeur Fictif', 'nl', 'Vendeur Fictif'],
  ] as const)('%j (%s) → %j', (text, lang, expected) => {
    expect(parseSeller(text, lang)).toBe(expected);
  });

  it.each([
    ['Versand durch: Amazon', 'de'],
    ['Sold by: X', 'unknown'],
    ['Vendu par : X', 'de'],
    ['', 'fr'],
  ] as const)('%j (%s) → null', (text, lang) => {
    expect(parseSeller(text, lang)).toBeNull();
  });

  it('result truncated to 255 characters', () => {
    expect(parseSeller(`Sold by: ${'a'.repeat(400)}`, 'en')).toHaveLength(255);
  });

  it.each(LANGS)('%s: pathological texts of 50,000 characters handled fast', (lang) => {
    const label = PAGE_LOCALES[lang].sellerLabels[0]!;
    for (const input of [
      `${label} `.repeat(5_000),
      `${' '.repeat(50_000)}${label}`,
      `${label}${' :'.repeat(25_000)}`,
    ]) {
      const t0 = performance.now();
      parseSeller(input, lang);
      expect(performance.now() - t0).toBeLessThan(250);
    }
  });
});

describe('resolvePageLanguage (R2.1)', () => {
  const docWith = (lang: string | null) => {
    const window = new Window();
    window.document.write(
      lang === null ? '<html><body></body></html>' : `<html lang="${lang}"><body></body></html>`,
    );
    return window.document as unknown as Document;
  };

  it.each([
    ['de-DE', 'amazon.de', 'de'],
    ['de-de', 'amazon.de', 'de'],
    ['en-gb', 'amazon.de', 'en'],
    ['fr-be', 'amazon.com.be', 'fr'],
    ['nl-be', 'amazon.com.be', 'nl'],
    ['NL_BE', 'amazon.com.be', 'nl'],
    ['tr-tr', 'amazon.de', 'unknown'],
    ['en-gb', 'amazon.fr', 'unknown'],
    ['fr-fr', 'amazon.fr', 'fr'],
  ])('lang=%s on %s → %s', (lang, id, expected) => {
    expect(resolvePageLanguage(docWith(lang), store(id))).toBe(expected);
  });

  it.each([null, '', '  '])('lang=%j → null (the caller tries the store languages)', (lang) => {
    expect(resolvePageLanguage(docWith(lang), store('amazon.de'))).toBeNull();
  });
});

describe('the parsers never throw', () => {
  const inputs = ['', ' ', 'Gratuit', '€', '\u0000', '((', '9'.repeat(1000), '.,.,.,'];
  it.each(inputs)('%j', (input) => {
    for (const lang of LANGS) {
      expect(() => parsePrice(input, lang)).not.toThrow();
      expect(() => parseOrderDate(input, lang, 'DMY')).not.toThrow();
      expect(() => parseOrderDate(input, lang, 'MDY')).not.toThrow();
      expect(() => parseSeller(input, lang)).not.toThrow();
    }
    expect(() => parsePrice(input, 'unknown')).not.toThrow();
    expect(() => parseSeller(input, 'unknown')).not.toThrow();
  });
});
