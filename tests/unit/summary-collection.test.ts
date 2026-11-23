import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CollectionSetting } from '@/shared/collections';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedPurchase, InstanceView } from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog } from './i18n-harness';

/** Summary and the target collection (spec 024, FR-008, US1-2, US1-4, US1-5, US3-1). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const line = (name: string) => fr['collections.summaryLine']!.replace('$1', name);
const ID_M = '11111111-1111-4111-8111-111111111111';
const ID_W = '22222222-2222-4222-8222-222222222222';
const CHOSEN: CollectionSetting = { chosen: { id: ID_W, name: 'Atelier' }, seen: null };
const SEVERAL: CollectionSetting = {
  chosen: null,
  seen: { id: ID_M, name: 'Maison', several: true },
};
const SINGLE: CollectionSetting = {
  chosen: null,
  seen: { id: ID_M, name: 'Maison', several: false },
};

const inst = (id: string, name: string, collection?: CollectionSetting): InstanceView => ({
  id,
  name,
  baseUrl: id === 'inst-a' ? 'https://homebox.example.com' : 'https://inventaire.example.org',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...(collection ? { collection } : {}),
});
const view = (instances: InstanceView[]): ConfigView => ({
  configured: true,
  locked: false,
  needsPassphrase: false,
  instances,
  defaultInstanceId: instances[0]!.id,
  maxInstances: 10,
});
const found = <T>(value: T) => ({ value, selector: 'x' });
const purchase: DetectedPurchase = {
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  orderNumber: found('000-0000000-0000000'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products: [
    {
      key: 'a',
      name: found('Clavier sans fil Exemple Pro'),
      unitPrice: found(9.9),
      currency: found('EUR'),
      quantity: found(1),
      imageUrl: found('https://m.media-amazon.com/images/I/exemple.jpg'),
    },
  ],
  documents: [],
};

function serve(locations: unknown = ok({ locations: [], lastUsedId: null })) {
  vi.mocked(send).mockImplementation(((msg: { type: string }) => {
    if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase, warnings: [] }));
    if (msg.type === 'location/list') return Promise.resolve(locations);
    if (msg.type === 'tag/list') return Promise.resolve(ok({ tags: [] }));
    if (msg.type === 'template/list')
      return Promise.resolve(ok({ templates: [], defaultTemplate: null, defaultState: 'none' }));
    return Promise.resolve(ok(undefined));
  }) as never);
}
async function mountSummary(config: ConfigView) {
  const w = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return w;
}
const collectionLine = (w: VueWrapper) => w.find('.target-collection');
const types = () => vi.mocked(send).mock.calls.map(([m]) => (m as { type: string }).type);

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('summary: the collection line, without any request (FR-008)', () => {
  it('chosen collection: « Collection : Atelier »', async () => {
    serve();
    const w = await mountSummary(view([inst('inst-a', 'Maison', CHOSEN)]));
    expect(collectionLine(w).text()).toBe(line('Atelier'));
    expect(types().some((t) => t.startsWith('instance/'))).toBe(false);
  });

  it('default setting, several collections seen: the default one is named', async () => {
    serve();
    const w = await mountSummary(view([inst('inst-a', 'Maison', SEVERAL)]));
    expect(collectionLine(w).text()).toBe(line('Maison'));
  });

  it.each([
    ['never checked', undefined],
    ['one collection', SINGLE],
  ])('default setting, %s: no line, summary as before (US1-4, US1-5)', async (_label, setting) => {
    serve();
    const w = await mountSummary(view([inst('inst-a', 'Maison', setting)]));
    expect(collectionLine(w).exists()).toBe(false);
    expect([...new Set(types())].sort()).toEqual([
      'detect/run',
      'entity-type/list',
      'location/list',
      'order-fields/get',
      'tag/list',
      'template/list',
    ]);
  });

  it('several instances: the line follows the chosen target', async () => {
    serve();
    const w = await mountSummary(
      view([inst('inst-a', 'Maison'), inst('inst-b', 'Atelier', CHOSEN)]),
    );
    expect(collectionLine(w).exists()).toBe(false);
    await w.get<HTMLSelectElement>('select#instance-target').setValue('inst-b');
    await flushPromises();
    expect(collectionLine(w).text()).toBe(line('Atelier'));
  });

  it('chosen collection no longer reachable: the locations read gives its message (US3-1)', async () => {
    serve(fail('COLLECTION_UNAVAILABLE'));
    const w = await mountSummary(view([inst('inst-a', 'Maison', CHOSEN)]));
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
  });
});
