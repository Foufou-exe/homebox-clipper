import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedProduct, DetectedPurchase, ImportDraft } from '@/shared/types';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import WarrantyField from '@/ui/components/WarrantyField.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadFixture } from './fixtures';
import { loadCatalog } from './i18n-harness';
import { warrantyMerchant } from './warranty-merchant';

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
const product = (key: string, seller: string | null = 'Amazon EU S.à r.l.'): DetectedProduct => ({
  key,
  name: found(`Produit ${key} Exemple`),
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
  seller: seller === null ? { value: null, reason: 'not_found' } : found(seller),
});
const purchase = (products: DetectedProduct[], source: DetectedPurchase['source'] = 'amazon.fr'): DetectedPurchase => ({
  source,
  pageUrl: 'https://www.amazon.fr/x',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [{ id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-amazon-999.pdf', size: 2048 }],
});

type Mounted = Awaited<ReturnType<typeof mountSummary>>;

async function mountSummary(p: DetectedPurchase | null) {
  vi.mocked(send).mockImplementation(((msg: { type: string }) => {
    if (msg.type === 'detect/run') return Promise.resolve(p ? ok({ purchase: p, warnings: [] }) : fail('NOT_AN_ORDER_PAGE'));
    // ADAPTED (015): the duplicate/check reply also carries similar, moreSimilar and incomplete.
    if (msg.type === 'duplicate/check') return Promise.resolve(ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }));
    return Promise.resolve(ok({ locations: [], lastUsedId: null }));
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const fields = (w: Mounted) => w.findAllComponents(WarrantyField);
const editors = (w: Mounted) => w.findAllComponents(FieldEditor);
const submitted = (w: Mounted) => (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }])[0];
const click = async (w: Mounted) => {
  await w.find('button.primary').trigger('click');
  await flushPromises();
};
const warrantyDate = (f: ReturnType<typeof fields>[number]) => f.get('input[type="date"]');

beforeEach(() => {
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SummaryView: one warranty section per product (011, Q-U17, R7, FR-001)', () => {
  it('two products: two independent sections whose names contain the product', async () => {
    const w = await mountSummary(purchase([product('a'), product('b')]));
    expect(fields(w)).toHaveLength(2);
    const dates = fields(w).map((f) => warrantyDate(f).attributes('aria-label'));
    expect(dates[0]).toContain('Produit a Exemple');
    expect(dates[1]).toContain('Produit b Exemple');
    await warrantyDate(fields(w)[0]!).setValue('2031-01-01');
    expect((warrantyDate(fields(w)[1]!).element as HTMLInputElement).value).toBe('2028-11-03');
  });

  it('a single product: one section, short labels', async () => {
    const w = await mountSummary(purchase([product('a')]));
    expect(fields(w)).toHaveLength(1);
    expect(warrantyDate(fields(w)[0]!).attributes('aria-label')).toBeUndefined();
  });

  it('the section is placed after the fields and only for a selected product', async () => {
    const w = await mountSummary(purchase([product('a'), product('b')]));
    const card = w.findAll('.line')[0]!;
    const html = card.html();
    expect(html.indexOf('class="editor"')).toBeLessThan(html.indexOf('class="warranty"'));
    await card.get('label.pick input[type="checkbox"]').setValue(false);
    expect(fields(w)).toHaveLength(1);
  });
});

describe('SummaryView: submit (011, R7, principle II)', () => {
  it('sends one warranty per product, as a deep copy', async () => {
    const w = await mountSummary(purchase([product('a'), product('b')]));
    await click(w);
    const payload = submitted(w);
    expect(payload.drafts.map((d) => d.warranty?.expires)).toEqual(['2028-11-03', '2028-11-03']);
    expect(payload.drafts[0]!.warranty).not.toBe(payload.drafts[1]!.warranty);
    await warrantyDate(fields(w)[0]!).setValue('2031-01-01');
    expect(payload.drafts[0]!.warranty?.expires).toBe('2028-11-03');
  });

  it('an unticked product sends no warranty', async () => {
    const w = await mountSummary(purchase([product('a'), product('b')]));
    await w.findAll('.line')[1]!.get('label.pick input[type="checkbox"]').setValue(false);
    await click(w);
    expect(submitted(w).drafts).toHaveLength(1);
    expect(submitted(w).drafts[0]!.name).toBe('Produit a Exemple');
  });

  it('nothing is sent before the confirmation click, the proposed warranty included', async () => {
    const w = await mountSummary(purchase([product('a')]));
    expect(fields(w)).toHaveLength(1);
    expect(w.emitted('submit')).toBeUndefined();
    expect(vi.mocked(send).mock.calls.some(([m]) => (m as { type: string }).type === 'import/start')).toBe(false);
    await click(w);
    expect(w.emitted('submit')).toHaveLength(1);
  });

  it('a warranty error blocks the confirmation button', async () => {
    const w = await mountSummary(purchase([product('a')]));
    const button = () => w.find('button.primary');
    expect(button().attributes('disabled')).toBeUndefined();
    await fields(w)[0]!.get('textarea').setValue('x'.repeat(1001));
    expect(button().attributes('disabled')).toBeDefined();
    await fields(w)[0]!.get('textarea').setValue('ok');
    expect(button().attributes('disabled')).toBeUndefined();
  });

  it('the warranty error appears once (in the warranty section, not duplicated in the fields)', async () => {
    const w = await mountSummary(purchase([product('a')]));
    await fields(w)[0]!.get('textarea').setValue('x'.repeat(1001));
    expect(w.text().split(fr['warranty.errors.detailsTooLong']!).length - 1).toBe(1);
  });
});

describe('SummaryView: purchase date and warranty (011, FR-005, US1-4)', () => {
  it('changing a product purchase date recomputes only its own warranty', async () => {
    const w = await mountSummary(purchase([product('a'), product('b')]));
    await editors(w)[0]!.get('input[type="date"]').setValue('2026-01-15');
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2028-01-15');
    expect((warrantyDate(fields(w)[1]!).element as HTMLInputElement).value).toBe('2028-11-03');
  });

  it('an edited warranty is not recomputed', async () => {
    const w = await mountSummary(purchase([product('a')]));
    await warrantyDate(fields(w)[0]!).setValue('2035-05-05');
    await editors(w)[0]!.get('input[type="date"]').setValue('2026-01-15');
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2035-05-05');
  });
});

describe('SummaryView: seller per product (011, R5, SC-003)', () => {
  it('order-mixed-sellers.html: only the product sold by the store gets the default warranty', async () => {
    const fr1 = AMAZON_STORES.find((s) => s.id === 'amazon.fr')!;
    const { doc, url } = loadFixture('order-mixed-sellers.html');
    const detected = createAmazonExtractor(fr1).extract(doc, url);
    const w = await mountSummary(detected);
    expect(fields(w)).toHaveLength(2);
    expect(fields(w)[0]!.find('input[type="date"]').exists()).toBe(true);
    expect(fields(w)[1]!.find('input[type="date"]').exists()).toBe(false);
    expect(fields(w)[1]!.text()).toContain(fr['warranty.reason.seller']);
    await click(w);
    expect(submitted(w).drafts.map((d) => d.warranty === null)).toEqual([false, true]);
  });

  it('a store outside the table (Amazon.nl): empty section with reason country on every product', async () => {
    const w = await mountSummary(purchase([product('a')], 'amazon.nl'));
    expect(fields(w)[0]!.text()).toContain(fr['warranty.reason.country']);
    expect(fields(w)[0]!.text()).toContain(fr['warranty.add']);
    await click(w);
    expect(submitted(w).drafts[0]!.warranty).toBeNull();
  });
});

describe('SummaryView: manual entry (011, FR-003)', () => {
  it('detection failed: empty section without a misleading reason, and "Add a warranty"', async () => {
    const w = await mountSummary(null);
    expect(fields(w)).toHaveLength(1);
    expect(fields(w)[0]!.find('.reason').exists()).toBe(false);
    expect(fields(w)[0]!.text()).toContain(fr['warranty.none']);
    expect(fields(w)[0]!.findAll('button').map((b) => b.text())).toContain(fr['warranty.add']);
    await fields(w)[0]!.findAll('button').find((b) => b.text() === fr['warranty.add'])!.trigger('click');
    expect(fields(w)[0]!.find('input[type="date"]').exists()).toBe(true);
  });
});

describe('SummaryView: warranty read on the page (011, Q-U17, US2, FR-004)', () => {
  it('two products with different page warranties: two independent sections, the page beats the legal one', async () => {
    const { doc, url } = loadFixture('warranty-two-products.html', 'https://shop.example.com/orders/999-0000000-0000001', 'warranty-test');
    const detected = warrantyMerchant().extract(doc, url);
    const w = await mountSummary({ ...detected, documents: purchase([]).documents });
    expect(fields(w)).toHaveLength(2);
    const [a, b] = fields(w);
    expect((warrantyDate(a!).element as HTMLInputElement).value).toBe('2029-11-03');
    expect(a!.text()).toContain(fr['warranty.origin.page']);
    expect(b!.get('input[type="checkbox"]').element).toHaveProperty('checked', true);
    expect(warrantyDate(b!).attributes('disabled')).toBeDefined();

    // Only the first product's warranty follows its own purchase date.
    await editors(w)[0]!.get('input[type="date"]').setValue('2026-01-15');
    expect((warrantyDate(a!).element as HTMLInputElement).value).toBe('2029-01-15');
    expect(b!.get('input[type="checkbox"]').element).toHaveProperty('checked', true);

    expect(w.emitted('submit')).toBeUndefined();
    await click(w);
    const drafts = submitted(w).drafts;
    expect(drafts[0]!.warranty).toMatchObject({ origin: 'page', details: 'Garantie 3 ans', durationMonths: 36 });
    expect(drafts[1]!.warranty).toMatchObject({ origin: 'page', lifetime: true, expires: null });
  });
});

describe('SummaryView: the warranty setting, read at each opening (011, US3, FR-007)', () => {
  const setting = (s: { v: 1; enabled: boolean; years: number | null }) =>
    fakeBrowser.storage.local.set({ warrantySettings: s });
  const one = (source: DetectedPurchase['source'] = 'amazon.fr', seller = 'Amazon EU S.à r.l.') =>
    purchase([product('a', seller)], source);

  beforeEach(() => fakeBrowser.reset());

  it('setting off, store seller: empty section, reason "disabled" (US3-1)', async () => {
    await setting({ v: 1, enabled: false, years: null });
    const w = await mountSummary(one());
    expect(fields(w)[0]!.text()).toContain(fr['warranty.reason.disabled']);
    expect(fields(w)[0]!.find('input[type="date"]').exists()).toBe(false);
  });

  it('setting off, but the page says 3 years: the page warranty is proposed (US3-3)', async () => {
    await setting({ v: 1, enabled: false, years: null });
    const withPage: DetectedProduct = {
      ...product('a'),
      pageWarranty: found({ months: 36, lifetime: false, label: 'Garantie 3 ans' }),
    };
    const w = await mountSummary(purchase([withPage]));
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2029-11-03');
  });

  it('3 years: expiry = purchase + 3 years, "Default warranty (3 years)" (US3-2)', async () => {
    await setting({ v: 1, enabled: true, years: 3 });
    const w = await mountSummary(one());
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2029-11-03');
    expect((fields(w)[0]!.get('textarea').element as HTMLTextAreaElement).value).toBe('Garantie par défaut (3 ans)');
  });

  it('3 years never creates a default outside the table or for a third-party seller', async () => {
    await setting({ v: 1, enabled: true, years: 3 });
    const nl = await mountSummary(one('amazon.nl'));
    expect(fields(nl)[0]!.find('input[type="date"]').exists()).toBe(false);
    const third = await mountSummary(one('amazon.fr', 'Boutique Exemple SARL'));
    expect(fields(third)[0]!.find('input[type="date"]').exists()).toBe(false);
  });

  it('"Add a warranty" outside the table proposes the duration of the setting, else 24 months', async () => {
    const add = async (w: Mounted) => {
      await fields(w)[0]!.findAll('button').find((b) => b.text() === fr['warranty.add'])!.trigger('click');
      return (warrantyDate(fields(w)[0]!).element as HTMLInputElement).value;
    };
    await setting({ v: 1, enabled: true, years: 3 });
    expect(await add(await mountSummary(one('amazon.nl')))).toBe('2029-11-03');
    fakeBrowser.reset();
    expect(await add(await mountSummary(one('amazon.nl')))).toBe('2028-11-03');
  });

  it('a change of the setting does not modify drafts already open (not retroactive)', async () => {
    const w = await mountSummary(one());
    await setting({ v: 1, enabled: false, years: null });
    await flushPromises();
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2028-11-03');
  });

  it('an unreadable storage does not block the popup', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('boom'));
    const w = await mountSummary(one());
    expect(fields(w)).toHaveLength(1);
    expect((warrantyDate(fields(w)[0]!).element as HTMLInputElement).value).toBe('2028-11-03');
    vi.restoreAllMocks();
  });
});

describe('SummaryView: lifetime warranty message (011, review)', () => {
  it('a lifetime warranty is sent without a date', async () => {
    const w = await mountSummary(purchase([product('a')]));
    await fields(w)[0]!.get('input[type="checkbox"]').setValue(true);
    await click(w);
    expect(submitted(w).drafts[0]!.warranty).toMatchObject({ lifetime: true, expires: null });
  });
});
