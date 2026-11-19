import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok, type ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  InstanceView,
  LocationOption,
  TagOption,
} from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog, makeGetMessage } from './i18n-harness';

/** Spec 016, delivery B, Q-U5: choosing the target instance in the summary (US3, T069). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const tr = makeGetMessage(fr);

const A: InstanceView = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: { status: 'ok', version: '0.27.0', at: '2026-11-19T10:00:00Z' },
  keyState: 'ready',
};
const B: InstanceView = {
  id: 'inst-b',
  name: 'Atelier',
  baseUrl: 'http://192.168.1.20:3101',
  maskedKey: 'hb_••••bbbb',
  lastCheck: null,
  keyState: 'ready',
};
const view = (
  instances: InstanceView[],
  defaultInstanceId: string | null = instances[0]?.id ?? null,
): ConfigView => ({
  configured: true,
  locked: false,
  needsPassphrase: false,
  instances,
  defaultInstanceId,
  maxInstances: 10,
});

const found = <T>(value: T) => ({ value, selector: 'x' });
const product = (key: string, name: string): DetectedProduct => ({
  key,
  name: found(name),
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: found('https://m.media-amazon.com/images/I/exemple.jpg'),
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    {
      id: 'detected-0',
      origin: 'detected',
      kind: 'invoice',
      label: 'facture-amazon-999.pdf',
      size: 2048,
    },
  ],
});

const loc = (id: string, name: string): LocationOption =>
  ({ id, name, path: [name] }) as LocationOption;
const LOCATIONS: Record<string, { locations: LocationOption[]; lastUsedId: string | null }> = {
  'inst-a': { locations: [loc('la1', 'Bureau A'), loc('la2', 'Salon A')], lastUsedId: 'la2' },
  'inst-b': { locations: [loc('lb1', 'Garage B'), loc('lb2', 'Cave B')], lastUsedId: 'lb1' },
};
const TAGS: Record<string, TagOption[]> = {
  'inst-a': [{ id: 'tag-a-amazon', name: 'Amazon' }],
  'inst-b': [],
};

type Reply = (msg: { type: string; instanceId?: string }) => unknown;
function serve(over: Partial<Record<string, Reply>> = {}) {
  vi.mocked(send).mockImplementation(((msg: { type: string; instanceId?: string }) => {
    const custom = over[msg.type];
    if (custom) return Promise.resolve(custom(msg));
    if (msg.type === 'detect/run')
      return Promise.resolve(
        ok({ purchase: purchase([product('a', 'Disque SSD Exemple 1 To')]), warnings: [] }),
      );
    if (msg.type === 'location/list') return Promise.resolve(ok(LOCATIONS[msg.instanceId!]));
    if (msg.type === 'tag/list') return Promise.resolve(ok({ tags: TAGS[msg.instanceId!] }));
    if (msg.type === 'duplicate/check')
      return Promise.resolve(
        ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }),
      );
    return Promise.resolve(ok(undefined));
  }) as never);
}
async function mountSummary(config: ConfigView) {
  const w = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return w;
}
const select = (w: VueWrapper) => w.get<HTMLSelectElement>('select#instance-target');
async function choose(w: VueWrapper, id: string) {
  await select(w).setValue(id);
  await flushPromises();
}
const sentOf = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m as { type: string; instanceId?: string })
    .filter((m) => m.type === type);
const submitted = (w: VueWrapper) =>
  (
    w.emitted('submit')?.[0] as
      [{ drafts: ImportDraft[]; instanceId: string; orderLocationId: string | null }] | undefined
  )?.[0];
const confirm = async (w: VueWrapper) => {
  await w.find('.footer button.primary').trigger('click');
  await flushPromises();
};
/** Text of the order location field (a combobox: its value is the chosen path). */
const orderLocation = (w: VueWrapper) =>
  (w.get('.order-location input').element as HTMLInputElement).value;
const tagBadges = (w: VueWrapper) => w.findAll('li.tag').map((li) => li.text());

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('summary: a single instance looks as before (016, US3, T069 a)', () => {
  it('no select; the badge shows the address, the state and the HTTP warning', async () => {
    serve();
    const w = await mountSummary(view([{ ...B, id: 'inst-a' }]));
    expect(w.find('select#instance-target').exists()).toBe(false);
    const badge = w.get('.instance');
    expect(badge.text()).toContain(fr['common.instanceLabel']);
    expect(badge.text()).toContain('http://192.168.1.20:3101');
    expect(badge.text()).toContain(fr['common.httpWarning']);
    expect(sentOf('location/list')).toEqual([{ type: 'location/list', instanceId: 'inst-a' }]);
  });
});

describe('summary: choosing the target among several instances (016, US3, T069 b–k)', () => {
  it('(b) a native labelled select, initial value = defaultInstanceId (US3-1); options « name (host) »', async () => {
    serve();
    const w = await mountSummary(view([A, B], 'inst-b'));
    const label = w.get('label[for="instance-target"]');
    expect(label.text()).toBe(fr['summary.instanceTarget']);
    expect(select(w).element.value).toBe('inst-b');
    expect(
      select(w)
        .findAll('option')
        .map((o) => o.text()),
    ).toEqual([
      tr('summary.instanceOption', ['Maison', 'homebox.example.com']),
      tr('summary.instanceOption', ['Atelier', '192.168.1.20:3101']),
    ]);
    expect(sentOf('location/list')).toEqual([{ type: 'location/list', instanceId: 'inst-b' }]);
    expect(sentOf('tag/list')).toEqual([{ type: 'tag/list', instanceId: 'inst-b' }]);
  });

  it('(b) without a successful import (or the last one deleted) the default is the first instance (US3-2)', async () => {
    serve();
    const w = await mountSummary(view([A, B], null));
    expect(select(w).element.value).toBe('inst-a');
    const gone = await mountSummary(view([A, B], 'deleted-instance'));
    expect(select(gone).element.value).toBe('inst-a');
  });

  it('(c) changing the target reloads locations and tags of B, preselects B’s last location, keeps the fields (US3-3)', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    expect(orderLocation(w)).toBe('Salon A');
    const nameInput = w.get('.line input[id$="-name"]');
    await nameInput.setValue('Nom modifié à la main');
    await choose(w, 'inst-b');
    expect(sentOf('location/list').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
    expect(sentOf('tag/list').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
    expect(orderLocation(w)).toBe('Garage B');
    expect((w.get('.line input[id$="-name"]').element as HTMLInputElement).value).toBe(
      'Nom modifié à la main',
    );
    // The documents and the photo choice are kept.
    expect(w.text()).toContain('facture-amazon-999.pdf');
    expect(w.find('.photo img').exists()).toBe(true);

    await confirm(w);
    const sent = submitted(w)!;
    expect(sent.instanceId).toBe('inst-b');
    expect(sent.orderLocationId).toBe('lb1');
    expect(sent.drafts[0]!.location).toEqual({ id: 'lb1', path: ['Garage B'] });
    expect(sent.drafts[0]!.name).toBe('Nom modifié à la main');
  });

  it('(c) back to A: A’s last location is proposed again', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    await choose(w, 'inst-a');
    await confirm(w);
    expect(submitted(w)!.orderLocationId).toBe('la2');
  });

  it('(c) tags: the identifiers of A are dropped, « new » is computed again against B (US3-4)', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    expect(tagBadges(w).join(' ')).not.toContain(fr['tags.badge.new']);
    await choose(w, 'inst-b');
    expect(tagBadges(w).join(' ')).toContain('Amazon');
    expect(tagBadges(w).join(' ')).toContain(fr['tags.badge.new']);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.tags).toEqual([{ name: 'Amazon' }]);
  });

  it('(d) out-of-order answers (A answers after B) are ignored: only the last target is shown (US3-8)', async () => {
    let releaseA!: () => void;
    const slowA = new Promise<void>((r) => (releaseA = r));
    let first = true;
    serve({
      'location/list': (msg) => {
        if (msg.instanceId === 'inst-a' && !first) return slowA.then(() => ok(LOCATIONS['inst-a']));
        first = false;
        return ok(LOCATIONS[msg.instanceId!]);
      },
    });
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    // A again (slow), then B again before A answers.
    await select(w).setValue('inst-a');
    await select(w).setValue('inst-b');
    await flushPromises();
    releaseA();
    await flushPromises();
    expect(orderLocation(w)).toBe('Garage B');
    expect(w.get('[aria-live="polite"]').text()).toBe(tr('summary.instanceLoaded', ['Atelier']));
    await confirm(w);
    expect(submitted(w)!.orderLocationId).toBe('lb1');
  });

  it('(e) duplicate/check and submit carry the chosen instanceId; import never names A when B is chosen', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    await confirm(w);
    expect(sentOf('duplicate/check').map((m) => m.instanceId)).toEqual(['inst-b']);
    expect(submitted(w)!.instanceId).toBe('inst-b');
  });

  it('(f) the select is disabled as soon as the import is confirmed (US3-7)', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    expect(select(w).attributes('disabled')).toBeUndefined();
    await confirm(w);
    expect(select(w).attributes('disabled')).toBeDefined();
  });

  it('(g) a polite live region announces the loaded instance by name', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    const live = w.get('[aria-live="polite"]');
    expect(live.text()).toBe(tr('summary.instanceLoaded', ['Atelier']));
  });

  it('(h) a loading error is named and the target never changes by itself', async () => {
    serve({
      'location/list': (msg) =>
        msg.instanceId === 'inst-b' ? fail('HOMEBOX_UNREACHABLE') : ok(LOCATIONS['inst-a']),
    });
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    expect(w.text()).toContain(
      tr('common.instanceError', ['Atelier', fr['error.HOMEBOX_UNREACHABLE']!]),
    );
    expect(select(w).element.value).toBe('inst-b');
    expect(sentOf('location/list').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
  });

  it('(i) the confirmation screen shows the target: name in the select, address, state and HTTP warning (FR-013)', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    const badge = w.get('#instance-target-badge');
    expect(select(w).attributes('aria-describedby')).toBe('instance-target-badge');
    expect(badge.text()).toContain('http://192.168.1.20:3101');
    expect(badge.text()).toContain(fr['common.httpWarning']);
    expect(
      select(w)
        .findAll('option')
        .find((o) => (o.element as HTMLOptionElement).selected)!
        .text(),
    ).toContain('Atelier');
  });

  it('(j) INSTANCE_NOT_FOUND at confirmation: shown, nothing submitted (FR-020)', async () => {
    serve({ 'duplicate/check': () => fail('INSTANCE_NOT_FOUND' as ErrorCode) });
    const w = await mountSummary(view([A, B]));
    await choose(w, 'inst-b');
    await confirm(w);
    expect(w.text()).toContain(
      tr('common.instanceError', ['Atelier', fr['error.INSTANCE_NOT_FOUND']!]),
    );
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('(k) keyboard: the select is a focusable native control, changed with the keyboard like any select', async () => {
    serve();
    const w = await mountSummary(view([A, B]));
    const el = select(w).element;
    el.focus();
    expect(document.activeElement).toBe(el);
    expect(el.tagName).toBe('SELECT');
    expect(el.tabIndex).toBe(0);
  });
});
