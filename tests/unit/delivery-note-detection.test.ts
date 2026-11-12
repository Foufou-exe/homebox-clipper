import { flushPromises, mount } from '@vue/test-utils';
import { documentId, documentLabel, isDeliveryNoteText } from '@/content/merchants/document-labels';
import { ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedPurchase, ImportDraft } from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { deliveryNoteMerchant } from './delivery-note-merchant';
import { loadFixture } from './fixtures';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const URL_ORDER = 'https://shop.example.com/orders/999-0000000-0000001';
const merchant = deliveryNoteMerchant();
const page = () => loadFixture('order.html', URL_ORDER, 'delivery-note-test');
const config: ConfigView = {
  configured: true,
  baseUrl: 'https://homebox.example.com',
  lastCheck: { status: 'ok', version: '0.27.0', at: '2026-10-22T10:00:00Z' },
};

describe('delivery note detection on a fictional merchant (007, Q-U10, Q-U11, FR-005, V6, V7)', () => {
  it('a "Bon de livraison" link (PDF, same origin) is detected as delivery_note, in page order', () => {
    const { doc, url } = page();
    const docs = merchant.extract(doc, url).documents.filter((d) => d.kind === 'delivery_note');
    expect(docs.map((d) => d.id)).toEqual(['detected-delivery-0', 'detected-delivery-1']);
    expect(docs[0]).toMatchObject({
      origin: 'detected',
      label: 'bon-de-livraison-shop-999-0000000-0000001.pdf',
      url: 'https://shop.example.com/documents/bl-1.pdf',
    });
    expect(docs[1]?.label).toBe('bon-de-livraison-shop-999-0000000-0000001-2.pdf');
    expect(docs[1]?.url).toBe('https://shop.example.com/documents/lien-libelle.pdf');
  });

  it('return label, credit note and printable summary are never delivery notes', () => {
    const { doc, url } = page();
    const urls = merchant.extract(doc, url).documents.map((d) => d.url);
    for (const refused of ['etiquette-1', 'avoir-1', 'recap-1']) {
      expect(urls.some((u) => u?.includes(refused)), refused).toBe(false);
    }
  });

  it('the invoice stays an invoice and is not duplicated as a delivery note (mutual exclusion, V7)', () => {
    const { doc, url } = page();
    const docs = merchant.extract(doc, url).documents;
    expect(docs.filter((d) => d.kind === 'invoice')).toEqual([
      {
        id: 'detected-0',
        origin: 'detected',
        kind: 'invoice',
        label: 'facture-shop-999-0000000-0000001.pdf',
        url: 'https://shop.example.com/documents/fa-1.pdf',
      },
    ]);
    const urls = docs.map((d) => d.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('no link: nothing is invented; another origin and a non-PDF link are ignored', async () => {
    const { doc, url } = page();
    const urls = (await merchant.resolveDocuments(doc, url, fetch)).map((d) => d.url);
    expect(urls.some((u) => u?.includes('autre.example.net'))).toBe(false);
    expect(urls.some((u) => u?.endsWith('.html'))).toBe(false);
    const empty = loadFixture('order.html', URL_ORDER, 'delivery-note-test');
    empty.doc.querySelectorAll('ul.documents').forEach((el) => el.remove());
    expect(merchant.extract(empty.doc, empty.url).documents).toEqual([]);
  });

  it('documentLabel / documentId: invoices identical to the existing names, delivery notes prefixed', () => {
    expect(documentLabel('invoice', 'amazon', '999-0000000-0000001', 0)).toBe('facture-amazon-999-0000000-0000001.pdf');
    expect(documentLabel('invoice', 'amazon', '999-0000000-0000001', 1)).toBe('facture-amazon-999-0000000-0000001-2.pdf');
    expect(documentLabel('invoice', 'amazon', null, 0)).toBe('facture-amazon.pdf');
    expect(documentLabel('invoice', 'amazon', null, 2)).toBe('facture-amazon-3.pdf');
    expect(documentId('invoice', 0)).toBe('detected-0');
    expect(documentId('invoice', 3)).toBe('detected-3');
    expect(documentLabel('delivery_note', 'cdiscount', '12-3', 0)).toBe('bon-de-livraison-cdiscount-12-3.pdf');
    expect(documentLabel('delivery_note', 'cdiscount', '12-3', 1)).toBe('bon-de-livraison-cdiscount-12-3-2.pdf');
    expect(documentLabel('delivery_note', 'cdiscount', null, 0)).toBe('bon-de-livraison-cdiscount.pdf');
    expect(documentId('delivery_note', 0)).toBe('detected-delivery-0');
    expect(documentId('delivery_note', 2)).toBe('detected-delivery-2');
  });

  it.each([
    'Bon de livraison',
    'bordereau de livraison',
    'Delivery note',
    'Packing slip',
    'dispatch note',
    'Lieferschein',
    'Albarán',
    'documento di trasporto',
    'Pakbon',
  ])('isDeliveryNoteText accepts "%s"', (text) => {
    expect(isDeliveryNoteText(text)).toBe(true);
  });

  it.each([
    'Étiquette de retour',
    'Return label',
    'RMA',
    'Facture',
    'Invoice',
    'Rechnung',
    'Avoir',
    'Credit note',
    'Gutschrift',
    'Récapitulatif de commande imprimable',
    'Printable order summary',
    'Bon de livraison et facture',
    'Télécharger',
    '',
  ])('isDeliveryNoteText refuses "%s"', (text) => {
    expect(isDeliveryNoteText(text)).toBe(false);
  });
});

describe('delivery note in the summary (007, US2-2)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  async function mountSummary() {
    const { doc, url } = page();
    const purchase: DetectedPurchase = merchant.extract(doc, url);
    vi.mocked(send).mockImplementation(((msg: { type: string }) => {
      if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase, warnings: [] }));
      if (msg.type === 'duplicate/check') return Promise.resolve(ok({ matches: [] }));
      return Promise.resolve(ok({ locations: [], lastUsedId: null }));
    }) as never);
    const wrapper = mount(SummaryView, { props: { tabId: 1, config } });
    await flushPromises();
    return wrapper;
  }

  it('a detected delivery note is listed, checked, typed "Bon de livraison"; adding a manual keeps it checked; nothing is sent before the click', async () => {
    const w = await mountSummary();
    const rows = w.findAll('ul.docs > li').filter((li) => li.find('select').exists());
    const row = rows.find((li) => li.text().includes('bon-de-livraison-shop-999-0000000-0000001.pdf'))!;
    expect(row).toBeDefined();
    expect((row.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect((row.find('select').element as HTMLSelectElement).value).toBe('delivery_note');
    expect(row.find('option[value="delivery_note"]').text()).toBe('Bon de livraison');

    const picker = w.findComponent({ name: 'DocumentPicker' });
    await picker.find('select').setValue('manual');
    const input = picker.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['%PDF-1.7\n1 0 obj'], 'guide.pdf', { type: 'application/pdf' })],
      configurable: true,
    });
    await input.trigger('change');
    await flushPromises();
    expect((row.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);

    expect(vi.mocked(send).mock.calls.some(([m]) => (m as { type: string }).type === 'import/start')).toBe(false);
    expect(w.emitted('submit')).toBeUndefined();
    await w.find('button.primary').trigger('click');
    await flushPromises();
    const [payload] = w.emitted('submit')![0] as [{ drafts: ImportDraft[] }];
    const kinds = payload.drafts[0]!.documents.map((d) => d.kind);
    expect(kinds).toContain('delivery_note');
    expect(kinds).toContain('manual');
  });
});
