import { MERCHANT_CATALOG, storeForPageUrl } from '@/content/merchants/catalog';
import { LEGAL_WARRANTY_MONTHS, legalWarrantyMonths } from '@/shared/warranty';

/**
 * Any change to this test requires first a sourced line in specs/011-warranty-fields/legal-sources.md
 * (official text read). The table is frozen by the inline snapshot below.
 */
describe('LEGAL_WARRANTY_MONTHS: frozen and sourced table (011, Q-U3, FR-002, SC-003)', () => {
  it('snapshot: exactly FR, DE, IT, BE at 24 months and ES at 36', () => {
    expect(LEGAL_WARRANTY_MONTHS).toMatchInlineSnapshot(`
      {
        "BE": 24,
        "DE": 24,
        "ES": 36,
        "FR": 24,
        "IT": 24,
      }
    `);
  });

  // One row per country, each tied to its official source.
  it.each([
    // France: Code de la consommation, art. L217-3 (https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142579)
    ['FR', 24],
    // Germany: BGB § 438 Abs. 1 Nr. 3 (https://www.gesetze-im-internet.de/bgb/__438.html)
    ['DE', 24],
    // Italy: Codice del consumo, art. 133 c.1 (https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206~art133)
    ['IT', 24],
    // Belgium: Ancien Code civil, art. 1649quater § 1er (https://www.ejustice.just.fgov.be/eli/loi/2022/03/20/2022031422/justel)
    ['BE', 24],
    // Spain: RDL 1/2007, art. 120.1 (https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555)
    ['ES', 36],
  ])('%s: %i months', (country, months) => {
    expect(legalWarrantyMonths(country)).toBe(months);
  });

  // No fixed duration or outside the table:
  // NL: https://consument.acm.nl/garantie-reparatie-geld-terug/garantie-maar-2-jaar-vaak-niet-waar
  // GB: https://www.legislation.gov.uk/ukpga/2015/15/section/19
  // US: https://consumer.ftc.gov/articles/warranties
  it.each(['NL', 'GB', 'US', 'CH', 'NO', 'AT', 'PL', 'SE', 'FI', 'PT', 'IE', 'XX', '', 'fr', null])(
    '%j: no default warranty',
    (country) => {
      expect(legalWarrantyMonths(country)).toBeNull();
    },
  );

  it('invariants: ISO two-letter codes, integer months from 12 to 60', () => {
    for (const [country, months] of Object.entries(LEGAL_WARRANTY_MONTHS)) {
      expect(country).toMatch(/^[A-Z]{2}$/);
      expect(Number.isInteger(months)).toBe(true);
      expect(months).toBeGreaterThanOrEqual(12);
      expect(months).toBeLessThanOrEqual(60);
    }
  });
});

describe('catalog: country and own sellers (011, SC-003)', () => {
  it('every entry has a valid country and non-empty ownSellers or any', () => {
    for (const e of MERCHANT_CATALOG) {
      expect(e.country, e.id).toMatch(/^[A-Z]{2}$/);
      expect(e.ownSellers === 'any' || e.ownSellers.length > 0, e.id).toBe(true);
    }
  });

  it.each([
    ['amazon.fr', 24],
    ['amazon.de', 24],
    ['amazon.it', 24],
    ['amazon.com.be', 24],
    ['amazon.es', 36],
    ['amazon.nl', null],
    ['amazon.co.uk', null],
    ['amazon.com', null],
  ])('%s: %j', (id, months) => {
    const entry = MERCHANT_CATALOG.find((e) => e.id === id)!;
    expect(legalWarrantyMonths(entry.country)).toBe(months);
  });

  it('unknown store: no default warranty', () => {
    const entry = storeForPageUrl('https://www.example.com/your-orders');
    expect(entry).toBeNull();
    expect(legalWarrantyMonths(entry?.country ?? null)).toBeNull();
  });
});
