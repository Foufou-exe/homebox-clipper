import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedProduct, DetectedPurchase, ImportDraft } from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { completedDraft } from '@/ui/popup/completion';
import { draft as baseDraft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

/** Order page link in the summary (spec 025, Q-U1, contracts/ui.md §2). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const NUMBER = '000-0000000-0000000';
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const ON = { enabled: true };
const OFF = { enabled: false };

const instance = (id: string, name: string, baseUrl: string) => ({
  id,
  name,
  baseUrl,
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready' as const,
});
const A = instance('inst-a', 'Maison', 'https://homebox.example.com');
const B = instance('inst-b', 'Atelier', 'https://inventaire.example.org');
const config = (instances = [A]): ConfigView => ({
  configured: true,
  instances,
  defaultInstanceId: instances[0]!.id,
});

const found = <T>(value: T) => ({ value, selector: 'x' });
const product = (key: string, name: string): DetectedProduct => ({
  key,
  name: found(name),
  unitPrice: found(49.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[], pageUrl: string): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl,
  orderNumber: found(NUMBER),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    { id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-000.pdf', size: 2048 },
  ],
});
const CLAVIER = product('a', 'Clavier sans fil Exemple Pro');
const SOURIS = product('b', 'Souris Exemple');

interface Opts {
  /** Raw value of `storage.local.orderLinkByInstance`; defaults to the option on for both instances. */
  table?: unknown;
  pageUrl?: string;
  cfg?: ConfigView;
}

async function mountSummary(products: DetectedProduct[], opts: Opts = {}) {
  vi.mocked(send).mockImplementation(((msg: { type: string; instanceId?: string }) => {
    switch (msg.type) {
      case 'detect/run':
        return Promise.resolve(
          ok({
            purchase: purchase(products, opts.pageUrl === undefined ? ORDER_URL : opts.pageUrl),
            warnings: [],
          }),
        );
      case 'duplicate/check':
        return Promise.resolve(
          ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }),
        );
      case 'tag/list':
        return Promise.resolve(ok({ tags: [] }));
      case 'location/list':
        return Promise.resolve(ok({ locations: [], lastUsedId: null }));
      case 'template/list':
        return Promise.resolve(ok({ templates: [], defaultTemplate: null, defaultState: 'none' }));
      case 'order-fields/get':
        return Promise.resolve(fail('BAD_MESSAGE'));
      default:
        return Promise.resolve(ok(undefined));
    }
  }) as never);
  await fakeBrowser.storage.local.set({
    orderLinkByInstance: opts.table === undefined ? { 'inst-a': ON, 'inst-b': ON } : opts.table,
  });
  const wrapper = mount(SummaryView, {
    props: { tabId: 1, config: opts.cfg ?? config() },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}
type Mounted = Awaited<ReturnType<typeof mountSummary>>;

const boxes = (w: Mounted) =>
  w.findAll('input[type="checkbox"]').filter((b) => b.attributes('id')?.includes('orderlink'));
const confirm = async (w: Mounted) => {
  await w.get('.footer button.primary').trigger('click');
  await flushPromises();
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const askedTypes = () => vi.mocked(send).mock.calls.map((c) => (c[0] as { type: string }).type);

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('order link checkbox in the summary (spec 025)', () => {
  it('U1: option on (read locally, no message); one checked box per product, with the address and HomeBox mention', async () => {
    const w = await mountSummary([CLAVIER, SOURIS]);
    expect(askedTypes().some((t) => t.includes('link'))).toBe(false);
    const list = boxes(w);
    expect(list).toHaveLength(2);
    expect(list.every((b) => (b.element as HTMLInputElement).checked)).toBe(true);
    const label = w.findAll('label').find((l) => l.text() === fr['orderLink.fieldLabel']);
    expect(label).toBeDefined();
    expect(w.text()).toContain(ORDER_URL);
    expect(w.text()).toContain(fr['orderLink.fieldHelp']!.split('$1')[0]!.trim());
  });

  it('U2: confirm: every draft carries orderLink: true and the same page address', async () => {
    const w = await mountSummary([CLAVIER, SOURIS]);
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(drafts.map((d) => d.orderLink)).toEqual([true, true]);
    expect(drafts.every((d) => d.pageUrl === ORDER_URL)).toBe(true);
  });

  it('U3: unchecking one product removes the key for that product only (never false)', async () => {
    const w = await mountSummary([CLAVIER, SOURIS]);
    await boxes(w)[1]!.setValue(false);
    await confirm(w);
    const [a, b] = submitted(w)!.drafts;
    expect(a!.orderLink).toBe(true);
    expect(Object.keys(b!)).not.toContain('orderLink');
  });

  it('U4: option off: no box, no key in the drafts', async () => {
    const w = await mountSummary([CLAVIER], { table: { 'inst-a': OFF } });
    expect(boxes(w)).toHaveLength(0);
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderLink');
  });

  it.each([
    ['an absent table', {}],
    ['a malformed entry', { 'inst-a': { enabled: 'yes' } }],
    ['a table that is not an object', 'x'],
  ])('U5: %s: the option is considered off', async (_label, table) => {
    const w = await mountSummary([CLAVIER], { table });
    expect(boxes(w)).toHaveLength(0);
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderLink');
  });

  it.each(['', 'ftp://shop.example.com/o', 'https://user:pwd@shop.example.com/o'])(
    'U6: page address %j: no box, no key',
    async (pageUrl) => {
      const w = await mountSummary([CLAVIER], { pageUrl });
      expect(boxes(w)).toHaveLength(0);
      await confirm(w);
      expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderLink');
    },
  );

  it('U7: the target follows the setting of each instance; the box state is kept', async () => {
    const w = await mountSummary([CLAVIER], {
      table: { 'inst-a': ON, 'inst-b': OFF },
      cfg: config([A, B]),
    });
    await boxes(w)[0]!.setValue(false);
    await w.get<HTMLSelectElement>('select#instance-target').setValue('inst-b');
    await flushPromises();
    expect(boxes(w)).toHaveLength(0);
    await w.get<HTMLSelectElement>('select#instance-target').setValue('inst-a');
    await flushPromises();
    expect(boxes(w)).toHaveLength(1);
    expect((boxes(w)[0]!.element as HTMLInputElement).checked).toBe(false);
  });

  it('U8: a product completed instead of created never carries orderLink', () => {
    const base = { ...baseDraft({ documents: [] }), orderLink: true as const };
    const done = completedDraft(base, { entityId: 'item-1', itemName: 'Clavier', keys: [] });
    expect(Object.keys(done)).not.toContain('orderLink');
    expect(done.complete).toBeDefined();
  });
});
