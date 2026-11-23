import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  EntityTypeListView,
  ImportDraft,
  LocationOption,
} from '@/shared/types';
import EntityTypePicker from '@/ui/components/EntityTypePicker.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';

/** Entity type selector in the summary (spec 023, Q-U3, contracts/ui.md). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

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
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    { id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-999.pdf', size: 2048 },
  ],
});
const ROMAN = product('a', 'Roman exemple');
const PERCEUSE = product('b', 'Perceuse exemple');
const LOCATIONS: LocationOption[] = [{ id: 'loc-1', name: 'Bureau', path: ['Maison', 'Bureau'] }];

const TYPES = [
  { id: 'et-item', name: 'Item' },
  { id: 'et-book', name: 'Livre' },
  { id: 'et-tool', name: 'Outil' },
];
const viewOf = (over: Partial<EntityTypeListView> = {}): EntityTypeListView => ({
  types: TYPES,
  defaultId: 'et-item',
  lastUsedId: null,
  ...over,
});

interface Replies {
  types?: unknown | ((instanceId: string) => unknown);
}

async function mountSummary(products: DetectedProduct[], replies: Replies = {}, cfg = config()) {
  vi.mocked(send).mockImplementation(((msg: { type: string; instanceId?: string }) => {
    switch (msg.type) {
      case 'detect/run':
        return Promise.resolve(ok({ purchase: purchase(products), warnings: [] }));
      case 'duplicate/check':
        return Promise.resolve(
          ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }),
        );
      case 'tag/list':
        return Promise.resolve(ok({ tags: [] }));
      case 'location/list':
        return Promise.resolve(ok({ locations: LOCATIONS, lastUsedId: null }));
      case 'template/list':
        return Promise.resolve(ok({ templates: [], defaultTemplate: null, defaultState: 'none' }));
      case 'entity-type/list': {
        const t = replies.types === undefined ? ok(viewOf()) : replies.types;
        return Promise.resolve(typeof t === 'function' ? t(msg.instanceId!) : t);
      }
      default:
        return Promise.resolve(ok(undefined));
    }
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config: cfg }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}
type Mounted = Awaited<ReturnType<typeof mountSummary>>;

const pickers = (w: Mounted) => w.findAllComponents(EntityTypePicker);
const choose = async (w: Mounted, id: string | null, i = 0) => {
  pickers(w)[i]!.vm.$emit('update:modelValue', id);
  await flushPromises();
};
const confirm = async (w: Mounted) => {
  await w.get('.footer button.primary').trigger('click');
  await flushPromises();
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const sentTypes = () =>
  vi.mocked(send).mock.calls.filter((c) => (c[0] as { type: string }).type === 'entity-type/list');

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('US1: the selector', () => {
  it('one native select per selected product, with the types and the server default selected', async () => {
    const w = await mountSummary([ROMAN, PERCEUSE]);
    expect(pickers(w)).toHaveLength(2);
    const select = w.get('select[aria-label]');
    expect(w.findAll('.entity-type-picker option').map((o) => o.attributes('value'))).toEqual([
      'et-item',
      'et-book',
      'et-tool',
      'et-item',
      'et-book',
      'et-tool',
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('et-item');
    expect(
      w
        .find('.entity-type-picker [role="combobox"], .entity-type-picker [role="listbox"]')
        .exists(),
    ).toBe(false);
    expect(sentTypes()).toHaveLength(1);
    expect(sentTypes()[0]![0]).toEqual({ type: 'entity-type/list', instanceId: 'inst-a' });
  });

  it('an unselected product has no selector', async () => {
    const w = await mountSummary([ROMAN, PERCEUSE]);
    await w.findAll('.pick input[type="checkbox"]')[1]!.setValue(false);
    expect(pickers(w)).toHaveLength(1);
  });

  it('a type other than the server default goes into the draft of this product only', async () => {
    const w = await mountSummary([ROMAN, PERCEUSE]);
    await choose(w, 'et-tool', 1);
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect('entityTypeId' in drafts[0]!).toBe(false);
    expect(drafts[1]!.entityTypeId).toBe('et-tool');
  });

  it('choosing the server default again sends no key at all', async () => {
    const w = await mountSummary([ROMAN]);
    await choose(w, 'et-tool');
    await choose(w, 'et-item');
    await confirm(w);
    expect('entityTypeId' in submitted(w)!.drafts[0]!).toBe(false);
  });

  it('the submit tells whether the types were read', async () => {
    const shown = await mountSummary([ROMAN]);
    await confirm(shown);
    expect((shown.emitted('submit')?.[0] as [{ entityTypesRead: boolean }])[0].entityTypesRead).toBe(true);
    const hidden = await mountSummary([ROMAN], { types: fail('ENTITY_TYPES_UNAVAILABLE') });
    await confirm(hidden);
    expect((hidden.emitted('submit')?.[0] as [{ entityTypesRead: boolean }])[0].entityTypesRead).toBe(false);
  });

  it('left untouched: no entityTypeId in any draft', async () => {
    const w = await mountSummary([ROMAN, PERCEUSE]);
    await confirm(w);
    for (const d of submitted(w)!.drafts) expect('entityTypeId' in d).toBe(false);
  });
});

describe('US2: the last type used is preselected', () => {
  it('the last type used is selected for every product and sent', async () => {
    const w = await mountSummary([ROMAN, PERCEUSE], {
      types: ok(viewOf({ lastUsedId: 'et-book' })),
    });
    for (const p of pickers(w)) expect(p.props('modelValue')).toBe('et-book');
    await confirm(w);
    expect(submitted(w)!.drafts.map((d) => d.entityTypeId)).toEqual(['et-book', 'et-book']);
  });

  it('an unknown server default: first empty option, nothing sent until a type is chosen', async () => {
    const w = await mountSummary([ROMAN], { types: ok(viewOf({ defaultId: null })) });
    expect(w.findAll('.entity-type-picker option')[0]!.attributes('value')).toBe('');
    await confirm(w);
    expect('entityTypeId' in submitted(w)!.drafts[0]!).toBe(false);
  });

  it('changing the target reads the types of the new instance and resets the choices', async () => {
    const w = await mountSummary(
      [ROMAN],
      {
        types: (instanceId: string) =>
          ok(
            instanceId === 'inst-b'
              ? viewOf({
                  types: [
                    { id: 'b-1', name: 'Autre' },
                    { id: 'b-2', name: 'Zéro' },
                  ],
                  defaultId: 'b-1',
                })
              : viewOf(),
          ),
      },
      config([A, B]),
    );
    await choose(w, 'et-tool');
    await w.get('select').setValue('inst-b');
    await flushPromises();
    expect(sentTypes().map((c) => (c[0] as { instanceId: string }).instanceId)).toEqual([
      'inst-a',
      'inst-b',
    ]);
    expect(pickers(w)[0]!.props('modelValue')).toBe('b-1');
    await confirm(w);
    expect('entityTypeId' in submitted(w)!.drafts[0]!).toBe(false);
  });
});

describe('US3: nothing changes without usable types', () => {
  it.each([
    ['unsupported (404)', fail('ENTITY_TYPES_UNSUPPORTED', 404)],
    ['unavailable', fail('ENTITY_TYPES_UNAVAILABLE')],
    ['unauthorized', fail('UNAUTHORIZED')],
    ['a single type', ok(viewOf({ types: [TYPES[0]!] }))],
    ['no type', ok(viewOf({ types: [] }))],
    ['an invalid shape', ok({ types: 'x' })],
    ['an empty answer', undefined as unknown],
  ])('no selector, no banner, no key in the draft: %s', async (_label, reply) => {
    const w = await mountSummary([ROMAN], { types: reply === undefined ? ok(undefined) : reply });
    expect(pickers(w)).toHaveLength(0);
    expect(w.find('.entity-type-picker').exists()).toBe(false);
    expect(w.text()).not.toMatch(/types? d'objets? HomeBox/i);
    await confirm(w);
    expect('entityTypeId' in submitted(w)!.drafts[0]!).toBe(false);
  });

  it('a request that throws hides the selector too', async () => {
    const w = await mountSummary([ROMAN], { types: () => Promise.reject(new Error('x')) });
    expect(pickers(w)).toHaveLength(0);
    await confirm(w);
    expect(submitted(w)!.drafts).toHaveLength(1);
  });
});
