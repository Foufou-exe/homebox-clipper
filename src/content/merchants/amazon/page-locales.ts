/**
 * ONLY file containing texts specific to the language of an Amazon page (counterpart of selectors.ts for
 * the DOM selectors, principle III): month names, "sold by" labels, number convention.
 * Fix a label here when Amazon changes its wording, and add a fixture reproducing it (principle VII).
 *
 * Labels marked "to confirm on a real page" have not been observed yet on a real page of that language
 * (research.md, R2.5): they stay until an anonymized real page confirms or corrects them.
 */
import type { PageLanguage } from './stores';

export interface PageLocale {
  /** Normalized keys: lower case, without accents, without final dot. */
  readonly months: Readonly<Record<string, number>>;
  /** "9 novembre 2026", "9. November 2026", "9 de noviembre de 2026". */
  readonly dayMonthYear: boolean;
  /** "November 9, 2026" (English only). */
  readonly monthDayYear: boolean;
  readonly decimalSeparator: ',' | '.';
  /** "Sold by" labels, read before the seller name. */
  readonly sellerLabels: readonly string[];
  /** Used by the fixture reconstruction script only (scripts/fixtures/reconstruct-amazon.ts). */
  readonly fixtureLabels: {
    readonly invoice: string;
    readonly soldBy: string;
    readonly orderedOn: string;
  };
}

export const PAGE_LOCALES: Readonly<Record<PageLanguage, PageLocale>> = {
  fr: {
    months: {
      janvier: 1,
      janv: 1,
      jan: 1,
      fevrier: 2,
      fevr: 2,
      fev: 2,
      mars: 3,
      avril: 4,
      avr: 4,
      mai: 5,
      juin: 6,
      juillet: 7,
      juil: 7,
      aout: 8,
      septembre: 9,
      sept: 9,
      sep: 9,
      octobre: 10,
      oct: 10,
      novembre: 11,
      nov: 11,
      decembre: 12,
      dec: 12,
    },
    dayMonthYear: true,
    monthDayYear: false,
    decimalSeparator: ',',
    // Observed on real pages (fixtures real-*, 2026-11-02).
    sellerLabels: ['Vendu par'],
    fixtureLabels: {
      invoice: 'Facture',
      soldBy: 'Vendu par :',
      orderedOn: 'Commande effectuée le',
    },
  },
  de: {
    months: {
      januar: 1,
      jan: 1,
      februar: 2,
      feb: 2,
      marz: 3,
      mar: 3,
      mrz: 3,
      april: 4,
      apr: 4,
      mai: 5,
      juni: 6,
      jun: 6,
      juli: 7,
      jul: 7,
      august: 8,
      aug: 8,
      september: 9,
      sep: 9,
      sept: 9,
      oktober: 10,
      okt: 10,
      november: 11,
      nov: 11,
      dezember: 12,
      dez: 12,
    },
    dayMonthYear: true,
    monthDayYear: false,
    decimalSeparator: ',',
    // To confirm on a real page. "Versand durch" (shipped by) is deliberately absent.
    sellerLabels: ['Verkauf durch', 'Verkäufer'],
    // To confirm on a real page.
    fixtureLabels: { invoice: 'Rechnung', soldBy: 'Verkauf durch:', orderedOn: 'Bestellt am' },
  },
  es: {
    months: {
      enero: 1,
      ene: 1,
      febrero: 2,
      feb: 2,
      marzo: 3,
      mar: 3,
      abril: 4,
      abr: 4,
      mayo: 5,
      may: 5,
      junio: 6,
      jun: 6,
      julio: 7,
      jul: 7,
      agosto: 8,
      ago: 8,
      septiembre: 9,
      setiembre: 9,
      sep: 9,
      sept: 9,
      octubre: 10,
      oct: 10,
      noviembre: 11,
      nov: 11,
      diciembre: 12,
      dic: 12,
    },
    dayMonthYear: true,
    monthDayYear: false,
    decimalSeparator: ',',
    // To confirm on a real page.
    sellerLabels: ['Vendido por'],
    // To confirm on a real page.
    fixtureLabels: { invoice: 'Factura', soldBy: 'Vendido por:', orderedOn: 'Pedido realizado el' },
  },
  it: {
    months: {
      gennaio: 1,
      gen: 1,
      febbraio: 2,
      feb: 2,
      marzo: 3,
      mar: 3,
      aprile: 4,
      apr: 4,
      maggio: 5,
      mag: 5,
      giugno: 6,
      giu: 6,
      luglio: 7,
      lug: 7,
      agosto: 8,
      ago: 8,
      settembre: 9,
      set: 9,
      ottobre: 10,
      ott: 10,
      novembre: 11,
      nov: 11,
      dicembre: 12,
      dic: 12,
    },
    dayMonthYear: true,
    monthDayYear: false,
    decimalSeparator: ',',
    // To confirm on a real page.
    sellerLabels: ['Venduto da'],
    // To confirm on a real page.
    fixtureLabels: { invoice: 'Fattura', soldBy: 'Venduto da:', orderedOn: 'Ordine effettuato il' },
  },
  nl: {
    months: {
      januari: 1,
      jan: 1,
      februari: 2,
      feb: 2,
      maart: 3,
      mrt: 3,
      april: 4,
      apr: 4,
      mei: 5,
      juni: 6,
      jun: 6,
      juli: 7,
      jul: 7,
      augustus: 8,
      aug: 8,
      september: 9,
      sep: 9,
      sept: 9,
      oktober: 10,
      okt: 10,
      november: 11,
      nov: 11,
      december: 12,
      dec: 12,
    },
    dayMonthYear: true,
    monthDayYear: false,
    decimalSeparator: ',',
    // To confirm on a real page.
    sellerLabels: ['Verkocht door'],
    // To confirm on a real page.
    fixtureLabels: { invoice: 'Factuur', soldBy: 'Verkocht door:', orderedOn: 'Besteld op' },
  },
  en: {
    months: {
      january: 1,
      jan: 1,
      february: 2,
      feb: 2,
      march: 3,
      mar: 3,
      april: 4,
      apr: 4,
      may: 5,
      june: 6,
      jun: 6,
      july: 7,
      jul: 7,
      august: 8,
      aug: 8,
      september: 9,
      sep: 9,
      sept: 9,
      october: 10,
      oct: 10,
      november: 11,
      nov: 11,
      december: 12,
      dec: 12,
    },
    dayMonthYear: true,
    monthDayYear: true,
    decimalSeparator: '.',
    // To confirm on a real page.
    sellerLabels: ['Sold by'],
    // To confirm on a real page.
    fixtureLabels: { invoice: 'Invoice', soldBy: 'Sold by:', orderedOn: 'Order placed' },
  },
};
