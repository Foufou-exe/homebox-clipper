import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { documentId, documentLabel } from '@/content/merchants/document-labels';
import type { DocumentRef } from '@/shared/types';

const FIXTURES = resolve(__dirname, '../fixtures');

/** First-level `.html` files of each `tests/fixtures/amazon-*` folder. Never descends into `raw/`. */
function pages(): { dir: string; file: string; path: string }[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('amazon-'))
    .flatMap((d) =>
      readdirSync(resolve(FIXTURES, d.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.html'))
        .map((f) => ({ dir: d.name, file: f.name, path: resolve(FIXTURES, d.name, f.name) })),
    );
}

const STORE_OF_DIR: Record<string, string> = {
  'amazon-fr': 'amazon.fr',
  'amazon-de': 'amazon.de',
  'amazon-es': 'amazon.es',
  'amazon-it': 'amazon.it',
  'amazon-nl': 'amazon.nl',
  'amazon-com-be': 'amazon.com.be',
  'amazon-co-uk': 'amazon.co.uk',
  'amazon-com': 'amazon.com',
};

const all = pages();
const isMenu = (file: string) => file.includes('popover');
const PRINT_MENU = (origin: string) =>
  `<div><a href="${origin}/documents/download/abc/invoice.pdf">Facture 1</a>` +
  `<a href="${origin}/gp/css/summary/print.html?orderID=999-0000000-0000001">Récapitulatif de commande imprimable</a></div>`;

describe('Amazon never produces a delivery note (007, Q-U9, Q-U10, FR-005, FR-006, SC-003)', () => {
  it('guard: the sweep sees the eight store folders and never a raw/ path', () => {
    expect(new Set(all.map((p) => p.dir))).toEqual(new Set(Object.keys(STORE_OF_DIR)));
    expect(all.length).toBeGreaterThan(30);
    for (const p of all) expect(p.path).not.toMatch(/[\\/]raw[\\/]/);
  });

  it.each(all.filter((p) => !isMenu(p.file)).map((p) => [`${p.dir}/${p.file}`, p] as const))(
    '%s: extract and resolveDocuments yield no delivery note',
    async (_name, p) => {
      const store = AMAZON_STORES.find((s) => s.id === STORE_OF_DIR[p.dir])!;
      const url = `${store.origin}/your-orders/order-details?orderID=999-0000000-0000001`;
      const window = new Window({ url });
      window.document.write(readFileSync(p.path, 'utf8'));
      const doc = window.document as unknown as Document;
      const extractor = createAmazonExtractor(store);
      const fetchMenu = vi.fn(async () => new Response(PRINT_MENU(store.origin), { status: 200 }));
      const extracted: DocumentRef[] = extractor.extract(doc, new URL(url)).documents;
      const resolved = await extractor.resolveDocuments(doc, new URL(url), fetchMenu as unknown as typeof fetch);
      for (const d of [...extracted, ...resolved]) {
        expect(d.kind).toBe('invoice');
        expect(d.id).toMatch(/^detected-\d+$/);
        expect(d.id).not.toContain('delivery');
        expect(d.label).toMatch(/^facture-amazon(-[\w-]+?)?\.pdf$/);
        expect(d.label).not.toMatch(/bon-de-livraison/);
        expect(d.url).not.toContain('print.html');
      }
    },
  );

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))('%s: the printable summary is no document at all', async (_id, s) => {
    const url = `${s.origin}/your-orders/order-details?orderID=999-0000000-0000001`;
    const window = new Window({ url });
    window.document.write(
      `<div data-component="orderId">999-0000000-0000001</div>` +
        `<span data-a-popover='{"url":"/your-orders/invoice/popover?orderId=A"}'>x</span>` +
        `<a href="/gp/css/summary/print.html?orderID=999-0000000-0000001">Récapitulatif de commande imprimable</a>`,
    );
    const doc = window.document as unknown as Document;
    const ex = createAmazonExtractor(s);
    const fetchMenu = vi.fn(async () => new Response(PRINT_MENU(s.origin), { status: 200 }));
    const docs = await ex.resolveDocuments(doc, new URL(url), fetchMenu as unknown as typeof fetch);
    expect(docs.map((d) => d.url)).toEqual([`${s.origin}/documents/download/abc/invoice.pdf`]);
    expect(ex.extract(doc, new URL(url)).documents.some((d) => d.url?.includes('print.html'))).toBe(false);
  });

  it('invoices keep exactly the same id and label as before (byte for byte)', () => {
    const store = AMAZON_STORES.find((s) => s.id === 'amazon.fr')!;
    const url = `${store.origin}/your-orders/order-details`;
    const window = new Window({ url });
    window.document.write(
      `<div data-component="orderId">999-0000000-0000001</div>` +
        `<a href="/documents/download/a/invoice.pdf">F1</a><a href="/documents/download/b/invoice.pdf">F2</a>`,
    );
    const docs = createAmazonExtractor(store).extract(window.document as unknown as Document, new URL(url)).documents;
    for (const [i, d] of docs.entries()) {
      expect(d.id).toBe(`detected-${i}`);
      expect(d.label).toBe(documentLabel('invoice', 'amazon', '999-0000000-0000001', i));
      expect(d.id).toBe(documentId('invoice', i));
    }
    expect(docs.map((d) => d.label)).toEqual(['facture-amazon-999-0000000-0000001.pdf', 'facture-amazon-999-0000000-0000001-2.pdf']);
  });

  it('source: selectors.ts holds no delivery-note term', () => {
    const src = readFileSync(resolve(__dirname, '../../src/content/merchants/amazon/selectors.ts'), 'utf8');
    for (const term of ['livraison', 'delivery', 'packing', 'bordereau', 'Lieferschein', 'albar', 'pakbon']) {
      expect(src.toLowerCase(), term).not.toContain(term.toLowerCase());
    }
  });
});
