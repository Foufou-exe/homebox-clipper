/**
 * LOCAL tool: turns a raw Amazon order page saved by the user into an anonymized `real-*` fixture, with an
 * ALLOW LIST (method of tests/fixtures/amazon-fr/README.md, research.md R7). It contains no data.
 *
 *   bun scripts/fixtures/anonymize-amazon.ts <fixtures dir> <raw file name> <fixture name> [page language]
 *   bun scripts/fixtures/anonymize-amazon.ts amazon-de order-1.html real-order-single.html de
 *
 * The raw page is read from `tests/fixtures/<dir>/raw/` (ignored by git) on the user's machine only: no
 * agent runs this tool on a raw page, and a raw page is never committed nor attached to an issue. The tool
 * prints counts only, never a value of the page. The fixture is written only if the leak check finds 0 leak.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { PAGE_LOCALES } from '../../src/content/merchants/amazon/page-locales';
import { parseOrderDate } from '../../src/content/merchants/amazon/parse';
import type { PageLanguage } from '../../src/content/merchants/amazon/stores';
import { formatFixtureDate, formatFixturePrice } from './reconstruct-amazon';

/** Components removed entirely, whatever their content (address, payment, summary, buyer, gifts, ads, actions). */
const SENSITIVE_COMPONENT =
  /address|payment|summary|buyer|contact|gift|personali[sz]|recommend|sponsor|advert|\bads?\b|action|button|track/i;
const REMOVED_TAGS =
  'script, style, link, iframe, noscript, template, svg, form, input, textarea, select, meta, object, embed';

/** Generic interface labels kept as is (exact match after trimming), extended with the confirmed labels. */
const GENERIC_LABELS: Record<PageLanguage, string[]> = {
  fr: [
    'Votre compte',
    'Vos commandes',
    'Détails de la commande',
    'Numéro de commande',
    'Récapitulatif de commande imprimable',
  ],
  de: [],
  es: [],
  it: [],
  nl: [],
  en: [],
};
const SEPARATORS = ['›', '|', '·', '-', ':'];

/** Filler text in the language of the page. */
const FILLER: Record<PageLanguage, string> = {
  fr: 'Texte fictif',
  de: 'Fiktiver Text',
  es: 'Texto ficticio',
  it: 'Testo fittizio',
  nl: 'Fictieve tekst',
  en: 'Placeholder text',
};

const FICTIONAL_FIXTURE_DATE = '2024-03-15';
const SPACES = /[\s\u00a0\u202f\u2009]+/g;
const clean = (s: string) => s.replace(SPACES, ' ').trim();
const ORDER_NUMBER = /(?:\d{3}|D\d{2})-\d{7}-\d{7}/;
const PRICE = /[€£$]|\b(?:EUR|GBP|USD)\b/;

/**
 * Structural tokens a fixture may keep (and share with the raw page): an ALLOW LIST OF PATTERNS, never the
 * values found in the page. Anything else is dropped by `anonymize` and reported by `leakCheck`.
 */
const CLASS_OK =
  /^(?:(?:a|aok|od)-[a-z0-9_-]+|dynamic-width|invoice-list|item-view-left-col-inner|item-view-qty|order-date-invoice-item|order-details|shipment|yohtmlc-[a-z-]+)$/;
const ID_OK = /^(?:orderDetails|orderDetailsContainer|shipment-top-row)$/;
/** Amazon component names: camelCase identifiers with at least one capital, or a known lower-case one. */
const COMPONENT_OK = /^(?:[a-z]+(?:[A-Z][a-z]*)+|breadcrumb|cancelled|default|quantity|shipments|title)$/;

const keptClasses = (value: string) => value.split(/\s+/).filter((t) => CLASS_OK.test(t)).join(' ');
const isStructural = (token: string) => CLASS_OK.test(token) || ID_OK.test(token) || COMPONENT_OK.test(token);

export interface AnonymizeOptions {
  lang: PageLanguage;
  /** Number of the first fictional order (999-0000000-00000NN). */
  orderIndex?: number;
}

/** State of one anonymization: language, fictional order number and counters of generated values. */
interface Ctx {
  lang: PageLanguage;
  order: string;
  labels: Set<string>;
  asins: Map<string, number>;
  images: number;
  pdfs: number;
  products: number;
  prices: number;
}

function labelsOf(lang: PageLanguage): Set<string> {
  const l = PAGE_LOCALES[lang].fixtureLabels;
  return new Set([...GENERIC_LABELS[lang], l.invoice, l.soldBy, l.orderedOn, ...SEPARATORS]);
}

/** Removes the tags that may carry anything, the comments and the sensitive components. */
function stripSensitive(root: Element): void {
  root.querySelectorAll(REMOVED_TAGS).forEach((el) => el.remove());
  root.querySelectorAll('[data-component]').forEach((el) => {
    if (SENSITIVE_COMPONENT.test(el.getAttribute('data-component') ?? '')) el.remove();
  });
  const doc = root.ownerDocument;
  const comments = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const found: Node[] = [];
  for (let n = comments.nextNode(); n; n = comments.nextNode()) found.push(n);
  found.forEach((n) => n.parentNode?.removeChild(n));
}

/** Fictional link: same ASIN → same fictional product, PDF → fictional document, anything else → `#`. */
function fictionalHref(href: string, ctx: Ctx): string {
  const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(href)?.[1];
  if (asin) {
    if (!ctx.asins.has(asin)) ctx.asins.set(asin, ctx.asins.size + 1);
    return `/dp/B00FAKE${String(ctx.asins.get(asin)).padStart(3, '0')}`;
  }
  if (!href.includes('/documents/download/')) return '#';
  ctx.pdfs += 1;
  return `/documents/download/00000000-0000-0000-0000-${String(ctx.pdfs).padStart(12, '0')}/invoice.pdf`;
}

function fictionalSrc(el: Element, ctx: Ctx): string | null {
  if (el.tagName !== 'IMG') return null;
  if (!/^https:\/\/m\.media-amazon\.com\/images\/I\//.test(el.getAttribute('src') ?? '')) return null;
  ctx.images += 1;
  return `https://m.media-amazon.com/images/I/test-${ctx.images}.jpg`;
}

/** Attributes kept by the allow list: structural tokens by pattern, rebuilt href/src/data-a-popover. */
function keptAttributes(el: Element, ctx: Ctx): [string, string][] {
  const keep: [string, string][] = [];
  const cls = keptClasses(el.getAttribute('class') ?? '');
  if (cls) keep.push(['class', cls]);
  const id = el.getAttribute('id') ?? '';
  if (ID_OK.test(id)) keep.push(['id', id]);
  const component = el.getAttribute('data-component') ?? '';
  if (COMPONENT_OK.test(component)) keep.push(['data-component', component]);
  const href = el.getAttribute('href');
  if (href !== null) keep.push(['href', fictionalHref(href, ctx)]);
  const src = fictionalSrc(el, ctx);
  if (src) keep.push(['src', src]);
  if (/invoice/i.test(el.getAttribute('data-a-popover') ?? '')) {
    keep.push(['data-a-popover', JSON.stringify({ url: `/your-orders/invoice/popover?orderId=${ctx.order}` })]);
  }
  return keep;
}

function rewriteAttributes(el: Element, ctx: Ctx): void {
  const keep = keptAttributes(el, ctx);
  for (const name of el.getAttributeNames()) el.removeAttribute(name);
  for (const [name, value] of keep) el.setAttribute(name, value);
}

const currencyOf = (value: string): 'EUR' | 'GBP' | 'USD' => {
  if (/£|GBP/.test(value)) return 'GBP';
  return /\$|USD/.test(value) ? 'USD' : 'EUR';
};
const isDate = (value: string, lang: PageLanguage) =>
  parseOrderDate(value, lang, 'DMY') !== null || parseOrderDate(value, lang, 'MDY') !== null;

type TextRule = [(value: string, node: Text, ctx: Ctx) => boolean, (value: string, node: Text, ctx: Ctx) => string];

/** Generated value of a text node, by the first matching rule (order matters). */
const TEXT_RULES: TextRule[] = [
  [(v) => ORDER_NUMBER.test(v), (_v, _n, ctx) => ctx.order],
  [
    (v) => PRICE.test(v) && /\d/.test(v),
    (v, _n, ctx) => {
      ctx.prices += 1;
      return formatFixturePrice(Number(`${ctx.prices}${ctx.prices}.${ctx.prices}${ctx.prices}`), ctx.lang, currencyOf(v));
    },
  ],
  [(v, _n, ctx) => isDate(v, ctx.lang), (_v, _n, ctx) => formatFixtureDate(FICTIONAL_FIXTURE_DATE, ctx.lang, 'DMY')],
  [
    (v, _n, ctx) => PAGE_LOCALES[ctx.lang].sellerLabels.some((l) => v.toLowerCase().startsWith(l.toLowerCase())),
    (_v, n, ctx) => (n.parentElement?.closest('a') ? 'Vendeur Fictif' : `${PAGE_LOCALES[ctx.lang].fixtureLabels.soldBy} Vendeur Fictif`),
  ],
  [
    (_v, n) => Boolean(n.parentElement?.closest('[data-component="itemTitle"]')),
    (_v, _n, ctx) => {
      ctx.products += 1;
      return `Produit fictif ${ctx.products}`;
    },
  ],
  [(_v, n) => Boolean(n.parentElement?.closest('[data-component="orderedMerchant"]')), () => 'Vendeur Fictif'],
];

function generatedText(node: Text, ctx: Ctx): string | null {
  const value = clean(node.data);
  if (value === '' || ctx.labels.has(value)) return null;
  const rule = TEXT_RULES.find(([matches]) => matches(value, node, ctx));
  return rule ? rule[1](value, node, ctx) : FILLER[ctx.lang];
}

/** Every text node replaced by a generated value, except an exact generic label; spacing kept. */
function rewriteTexts(root: Element, ctx: Ctx): void {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const node of texts) {
    const generated = generatedText(node, ctx);
    if (generated === null) continue;
    const lead = /^\s*/.exec(node.data)?.[0] ?? '';
    const trail = /\s*$/.exec(node.data)?.[0] ?? '';
    node.data = `${lead}${generated}${trail}`;
  }
}

const skeleton = (htmlLang: string, body: string) =>
  `<!doctype html>\n<html lang="${htmlLang}">\n<body>\n${body}</body>\n</html>\n`;

/** Anonymized fixture (allow list) of a raw page; the language of the page is kept in `<html lang>`. */
export function anonymize(rawHtml: string, options: AnonymizeOptions): string {
  const { lang } = options;
  const window = new Window();
  window.document.write(rawHtml);
  const doc = window.document as unknown as Document;
  const declared = (doc.documentElement.getAttribute('lang') ?? '').trim().toLowerCase();
  const htmlLang = /^[a-z]{2}(?:-[a-z]{2})?$/.test(declared) ? declared : lang;
  const root = doc.querySelector('#orderDetails');
  if (!root) return skeleton(htmlLang, '');
  const ctx: Ctx = {
    lang,
    order: `999-0000000-${String(options.orderIndex ?? 21).padStart(7, '0')}`,
    labels: labelsOf(lang),
    asins: new Map(),
    images: 0,
    pdfs: 0,
    products: 0,
    prices: 0,
  };
  stripSensitive(root);
  [root, ...Array.from(root.querySelectorAll('*'))].forEach((el) => rewriteAttributes(el, ctx));
  rewriteTexts(root, ctx);
  return skeleton(htmlLang, `${root.outerHTML}\n`);
}

/** Values of the raw page that must never appear in a fixture (research.md R7, step 5). */
export function sensitiveValues(rawHtml: string): string[] {
  const values = new Set<string>();
  const window = new Window();
  window.document.write(rawHtml);
  const doc = window.document as unknown as Document;
  const add = (v: string | null | undefined) => {
    const c = clean(v ?? '');
    if (c.length >= 4) values.add(c);
  };
  const walker = doc.createTreeWalker(doc.documentElement, 4 | 128);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const data = (n as CharacterData).data;
    add(data);
    // Parts of a text ("Sold by: <seller>", "<name>, <street>"): each one is checked on its own.
    data.split(/[:|,;()\n]/).forEach(add);
  }
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const name of el.getAttributeNames()) add(el.getAttribute(name));
  }
  const text = rawHtml;
  const patterns = [
    /\b[A-Z0-9]{10}\b/g, // ASIN
    /(?:\d{3}|D\d{2})-\d{7}-\d{7}/g, // order number
    /\d{4,}/g, // digit sequences (card ends, tokens, postal codes)
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // e-mail
    /\+\d{1,3}[\d ().-]{6,}\d/g, // international phone (+49, +44, +1...)
    /\b0\d(?:[ .-]?\d{2}){4}\b/g, // national phone
    /\b\d{5}\b/g, // postal code (FR, DE, ES, IT)
    /\b\d{4} ?[A-Z]{2}\b/g, // postal code (NL)
    /\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/g, // postcode (UK)
  ];
  for (const re of patterns) for (const [m] of text.matchAll(re)) add(m);
  return [...values];
}

/** Values a fixture may share with the raw page: interface labels and fillers of every language. */
function allowedLabels(): Set<string> {
  const allowed = new Set<string>();
  for (const lang of Object.keys(PAGE_LOCALES) as PageLanguage[]) {
    labelsOf(lang).forEach((l) => allowed.add(l));
    PAGE_LOCALES[lang].sellerLabels.forEach((l) => allowed.add(l));
    allowed.add(FILLER[lang]);
  }
  return allowed;
}

/** Allowed: a structural token by pattern (class, id or component), a label of the interface, the language code. */
const isAllowed = (v: string, labels: Set<string>) =>
  labels.has(v) || /^[a-z]{2}(?:-[a-z]{2})?$/.test(v) || v.split(/\s+/).every(isStructural);

const isFictional = (v: string) =>
  /^(?:999-0000000-\d{7}|B00FAKE\d{3}|0+|Produit fictif \d+|Vendeur Fictif)$/.test(v);

/**
 * Leak check: the values of the raw page found in the fixture (0 expected). Returns the leaked values for
 * the tests only; the command line prints their number, never the values.
 */
export function leakCheck(fixtureHtml: string, rawHtml: string): string[] {
  const labels = allowedLabels();
  const haystack = fixtureHtml.replace(SPACES, ' ');
  return sensitiveValues(rawHtml).filter((v) => !isAllowed(v, labels) && !isFictional(v) && haystack.includes(v));
}

const isPageLanguage = (v: string): v is PageLanguage => Object.hasOwn(PAGE_LOCALES, v);

/** Arguments of the command line, or `null` if one of them is invalid (never a path outside the fixtures). */
export function parseArgs(argv: string[]): { dir: string; rawName: string; fixtureName: string; lang: PageLanguage } | null {
  const [dir = '', rawName = '', fixtureName = '', lang = 'fr'] = argv;
  if (!/^amazon-[a-z-]+$/.test(dir)) return null;
  if (rawName === '' || basename(rawName) !== rawName || rawName.startsWith('.')) return null;
  if (!/^real-[\w-]+\.html$/.test(fixtureName) || !isPageLanguage(lang)) return null;
  return { dir, rawName, fixtureName, lang };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args) {
    console.error(
      'Usage: bun scripts/fixtures/anonymize-amazon.ts <amazon-* dir> <raw file name> <real-*.html> [fr|de|es|it|nl|en]',
    );
    return 2;
  }
  const { dir, rawName, fixtureName, lang } = args;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures', dir);
  const raw = readFileSync(resolve(root, 'raw', rawName), 'utf8');
  const fixture = anonymize(raw, { lang });
  const leaks = leakCheck(fixture, raw);
  if (leaks.length > 0) {
    console.error(`Leak check: ${leaks.length} value(s) of the raw page found. Fixture NOT written.`);
    return 1;
  }
  writeFileSync(resolve(root, fixtureName), fixture);
  console.log(`Leak check: 0. Fixture written: ${dir}/${fixtureName}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)));
