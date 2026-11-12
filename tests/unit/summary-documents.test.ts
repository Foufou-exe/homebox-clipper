import { flushPromises, mount } from '@vue/test-utils';
import { ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedProduct, DetectedPurchase, DocumentRef, ImportDraft } from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog } from './i18n-harness';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const config: ConfigView = {
  configured: true,
  baseUrl: 'https://homebox.example.com',
  lastCheck: { status: 'ok', version: '0.27.0', at: '2026-10-22T10:00:00Z' },
};
const found = <T,>(value: T) => ({ value, selector: 'x' });
const product = (key: string): DetectedProduct => ({
  key,
  name: found(`Produit ${key} Exemple`),
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const detected: DocumentRef = { id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-amazon-999.pdf', size: 2048 };
const purchase = (products: DetectedProduct[], documents: DocumentRef[] = [detected]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/x',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-10-22'),
  seller: found('Vendeur Exemple'),
  products,
  // Fresh copies: the select edits the detected document in place, as it does on a real message.
  documents: documents.map((d) => ({ ...d })),
});

async function mountSummary(products = [product('a')], documents?: DocumentRef[]) {
  vi.mocked(send).mockImplementation(((msg: { type: string }) => {
    if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: purchase(products, documents), warnings: [] }));
    if (msg.type === 'duplicate/check') return Promise.resolve(ok({ matches: [] }));
    return Promise.resolve(ok({ locations: [], lastUsedId: null }));
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config } });
  await flushPromises();
  return wrapper;
}

async function addLocal(wrapper: Awaited<ReturnType<typeof mountSummary>>, kind: string, name: string, replace?: boolean) {
  const picker = wrapper.findComponent({ name: 'DocumentPicker' });
  await picker.find('select').setValue(kind);
  if (replace !== undefined) {
    const box = picker.find('label.inline input');
    if (box.exists()) await box.setValue(replace);
  }
  const input = picker.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    value: [new File(['%PDF-1.7\n1 0 obj'], name, { type: 'application/pdf' })],
    configurable: true,
  });
  await input.trigger('change');
  await flushPromises();
}

const rows = (w: Awaited<ReturnType<typeof mountSummary>>) => w.findAll('ul.docs > li').filter((li) => li.find('select').exists());
const submitted = (w: Awaited<ReturnType<typeof mountSummary>>) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[]; manualFiles: { docId: string }[] }])[0];
const importStarts = () => vi.mocked(send).mock.calls.filter(([m]) => (m as { type: string }).type === 'import/start');

describe('SummaryView: kind of each document (007, Q-U14, FR-007)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('a detected and a local document each have a typed select (five options, accessible name)', async () => {
    const w = await mountSummary();
    await addLocal(w, 'manual', 'guide.pdf');
    const r = rows(w);
    expect(r).toHaveLength(2);
    for (const li of r) {
      const options = li.findAll('option');
      expect(options.map((o) => o.attributes('value'))).toEqual(['invoice', 'manual', 'warranty', 'delivery_note', 'order_document']);
    }
    expect(r[0]!.find('select').attributes('aria-label')).toBe(fr['documents.kindFor']!.replace('$1', 'facture-amazon-999.pdf'));
    expect(r[1]!.find('select').attributes('aria-label')).toBe(fr['documents.kindFor']!.replace('$1', 'guide.pdf'));
    expect((r[1]!.find('select').element as HTMLSelectElement).value).toBe('manual');
    expect(w.find('.docs .chip').exists()).toBe(false);
  });

  it('changing a row to Manual then Warranty: the last kind is sent, file and checkbox untouched', async () => {
    const w = await mountSummary();
    await addLocal(w, 'invoice', 'scan.pdf', false);
    const local = rows(w)[1]!;
    await local.find('select').setValue('manual');
    await local.find('select').setValue('warranty');
    expect((local.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    await w.find('button.primary').trigger('click');
    await flushPromises();
    const payload = submitted(w);
    expect(payload.drafts[0]!.documents.map((d) => [d.label, d.kind])).toEqual([
      ['facture-amazon-999.pdf', 'invoice'],
      ['scan.pdf', 'warranty'],
    ]);
    expect(payload.manualFiles).toHaveLength(1);
    expect(payload.manualFiles[0]!.docId).toBe(payload.drafts[0]!.documents[1]!.id);
  });

  it('the kind of a detected row can be changed too', async () => {
    const w = await mountSummary();
    await rows(w)[0]!.find('select').setValue('order_document');
    await w.find('button.primary').trigger('click');
    await flushPromises();
    expect(submitted(w).drafts[0]!.documents[0]!.kind).toBe('order_document');
  });

  it.each(['manual', 'warranty', 'delivery_note'])('adding a %s does not uncheck the detected invoice', async (kind) => {
    const w = await mountSummary();
    await addLocal(w, kind, 'doc.pdf');
    expect((rows(w)[0]!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect((rows(w)[1]!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('adding an invoice with "replace the detected invoice" checked unchecks it (today\'s behaviour)', async () => {
    const w = await mountSummary();
    await addLocal(w, 'invoice', 'ma-facture.pdf', true);
    expect((rows(w)[0]!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
    expect((rows(w)[1]!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('several products: every draft receives the checked documents with their current kind (V9)', async () => {
    const w = await mountSummary([product('a'), product('b')]);
    await addLocal(w, 'manual', 'guide.pdf');
    await w.find('button.primary').trigger('click');
    await flushPromises();
    const { drafts } = submitted(w);
    expect(drafts).toHaveLength(2);
    for (const d of drafts) expect(d.documents.map((x) => x.kind)).toEqual(['invoice', 'manual']);
  });

  it('no import/start before the click on "Ajouter", even with a manual and a warranty added', async () => {
    const w = await mountSummary();
    await addLocal(w, 'manual', 'guide.pdf');
    await addLocal(w, 'warranty', 'garantie.pdf');
    expect(importStarts()).toHaveLength(0);
    expect(w.emitted('submit')).toBeUndefined();
    await w.find('button.primary').trigger('click');
    await flushPromises();
    expect(w.emitted('submit')).toHaveLength(1);
  });

  it('the "no invoice" prompt only shows when there is no document at all', async () => {
    const none = await mountSummary([product('a')], []);
    await none.find('button.primary').trigger('click');
    await flushPromises();
    expect(none.text()).toContain(fr['summary.noInvoicePrompt']);
    const withManual = await mountSummary([product('a')], []);
    await addLocal(withManual, 'manual', 'guide.pdf');
    await withManual.find('button.primary').trigger('click');
    await flushPromises();
    expect(withManual.text()).not.toContain(fr['summary.noInvoicePrompt']);
  });
});

describe('SummaryView: detected delivery note (007, Q-U15)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('is listed, checked, typed "Bon de livraison"; the select moves it to Manual and submit sends manual', async () => {
    const note: DocumentRef = { id: 'detected-delivery-0', origin: 'detected', kind: 'delivery_note', label: 'bon-de-livraison-shop.pdf' };
    const w = await mountSummary([product('a')], [detected, note]);
    const row = rows(w)[1]!;
    expect((row.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect((row.find('select').element as HTMLSelectElement).value).toBe('delivery_note');
    await row.find('select').setValue('manual');
    await w.find('button.primary').trigger('click');
    await flushPromises();
    expect(submitted(w).drafts[0]!.documents.map((d) => d.kind)).toEqual(['invoice', 'manual']);
  });
});
