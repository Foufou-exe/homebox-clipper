import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CollectionList, CollectionSetting } from '@/shared/collections';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import OptionsApp from '@/ui/options/App.vue';
import CollectionField from '@/ui/options/CollectionField.vue';
import InstancesCard from '@/ui/options/InstancesCard.vue';
import { loadCatalog } from './i18n-harness';

/** Target collection in the settings (spec 024, contracts/ui.md §1, §2). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const tr = (key: string, ...args: string[]) =>
  args.reduce((s, a, i) => s.replace(`$${i + 1}`, a), fr[key]!);
const ID_M = '11111111-1111-4111-8111-111111111111';
const ID_W = '22222222-2222-4222-8222-222222222222';
const MAISON = { id: ID_M, name: 'Maison' };
const ATELIER = { id: ID_W, name: 'Atelier' };
const inst = (over: Partial<InstanceView> = {}): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...over,
});
const B = inst({ id: 'inst-b', name: 'Atelier', baseUrl: 'https://inventaire.example.org' });
const listOf = (
  setting: CollectionSetting,
  over: Partial<CollectionList> = {},
): CollectionList => ({
  collections: [ATELIER, MAISON],
  defaultCollection: MAISON,
  setting,
  missing: false,
  ...over,
});
const DEFAULT_SEEN: CollectionSetting = { chosen: null, seen: { ...MAISON, several: true } };
const CHOSEN: CollectionSetting = { chosen: ATELIER, seen: { ...ATELIER, several: true } };

type Replies = Partial<Record<string, unknown | ((msg: Record<string, unknown>) => unknown)>>;
function serve(replies: Replies = {}, view?: () => ConfigView) {
  vi.mocked(send).mockImplementation(((msg: Record<string, unknown>) => {
    const r = replies[msg.type as string];
    if (r !== undefined)
      return Promise.resolve(
        typeof r === 'function' ? (r as (m: Record<string, unknown>) => unknown)(msg) : r,
      );
    if (view && (msg.type === 'config/get' || msg.type === 'session/open'))
      return Promise.resolve(view());
    if (msg.type === 'session/get-policy')
      return Promise.resolve({ v: 1, policy: 'browser-close' });
    if (msg.type === 'history/list')
      return Promise.resolve(ok({ state: 'locked', enabled: true, entries: [] }));
    if (msg.type === 'instance/collections') return Promise.resolve(ok(listOf(DEFAULT_SEEN)));
    if (msg.type === 'instance/set-collection')
      return Promise.resolve(ok(listOf(msg.collectionId ? CHOSEN : DEFAULT_SEEN)));
    return Promise.resolve(ok(undefined));
  }) as never);
}
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m as unknown as Record<string, unknown>)
    .filter((m) => m.type === type);
const mountField = async (locked: boolean, instance = inst()) => {
  const w = mount(CollectionField, { props: { instance, locked }, attachTo: document.body });
  await flushPromises();
  return w;
};
const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text() === text);
async function openPanel(w: VueWrapper) {
  await button(w, fr['collections.change']!)!.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('CollectionField: display without request (FR-001, FR-014)', () => {
  it('no setting: « Collection par défaut de la clé »; locked: « unlock to change », no control, no message', async () => {
    serve();
    const w = await mountField(true);
    expect(w.text()).toContain(fr['collections.label']);
    expect(w.text()).toContain(fr['collections.defaultOfKey']);
    expect(w.text()).toContain(fr['collections.unlockToChange']);
    expect(w.findAll('button')).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('chosen collection: its name, readable while locked', async () => {
    serve();
    const w = await mountField(true, inst({ collection: CHOSEN }));
    expect(w.get('.current strong').text()).toBe('Atelier');
  });

  it('default setting, several collections seen: the name of the default one', async () => {
    serve();
    const w = await mountField(false, inst({ collection: DEFAULT_SEEN }));
    expect(w.get('.current strong').text()).toBe(tr('collections.defaultOfKeyNamed', 'Maison'));
    expect(button(w, fr['collections.change']!)).toBeDefined();
  });

  it('one collection known (default setting): no « Changer » button, no selector (FR-004)', async () => {
    serve();
    const w = await mountField(
      false,
      inst({ collection: { chosen: null, seen: { ...MAISON, several: false } } }),
    );
    expect(w.get('.current strong').text()).toBe(tr('collections.onlyOne', 'Maison'));
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.find('select').exists()).toBe(false);
  });
});

describe('CollectionField: the panel (FR-003, FR-006)', () => {
  it('« Changer » reads the list of THIS instance; native select with the default first, then by name', async () => {
    serve();
    const w = await mountField(false, B);
    const change = button(w, fr['collections.change']!)!;
    expect(change.attributes('aria-expanded')).toBe('false');
    await openPanel(w);
    expect(change.attributes('aria-expanded')).toBe('true');
    expect(sent('instance/collections')).toEqual([
      { type: 'instance/collections', instanceId: 'inst-b' },
    ]);
    const select = w.get('select');
    expect(w.get(`label[for="${select.attributes('id')}"]`).text()).toBe(fr['collections.label']);
    expect(select.findAll('option').map((o) => [o.attributes('value'), o.text()])).toEqual([
      ['', tr('collections.defaultOfKeyNamed', 'Maison')],
      [ID_W, 'Atelier'],
      [ID_M, 'Maison'],
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('');
    expect(w.find('[role="listbox"], [role="combobox"]').exists()).toBe(false);
  });

  it('choose and save → instance/set-collection with the id only; announced; parent told', async () => {
    serve();
    const w = await mountField(false);
    await openPanel(w);
    await w.get('select').setValue(ID_W);
    await button(w, fr['collections.save']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/set-collection')).toEqual([
      { type: 'instance/set-collection', instanceId: 'inst-a', collectionId: ID_W },
    ]);
    expect(w.get('output:last-of-type').text()).toBe(fr['collections.saved']);
    expect(w.get('.current strong').text()).toBe('Atelier');
    expect(w.emitted('changed')).toHaveLength(1);
  });

  it('back to the default: collectionId null', async () => {
    serve({ 'instance/collections': ok(listOf(CHOSEN)) });
    const w = await mountField(false, inst({ collection: CHOSEN }));
    await openPanel(w);
    expect((w.get('select').element as HTMLSelectElement).value).toBe(ID_W);
    await w.get('select').setValue('');
    await button(w, fr['collections.save']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/set-collection')[0]).toEqual({
      type: 'instance/set-collection',
      instanceId: 'inst-a',
      collectionId: null,
    });
  });

  it('only one collection in the list (default setting): text, no selector (FR-004)', async () => {
    serve({ 'instance/collections': ok(listOf(DEFAULT_SEEN, { collections: [MAISON] })) });
    const w = await mountField(false);
    await openPanel(w);
    expect(w.text()).toContain(tr('collections.onlyOneOnInstance', 'Maison'));
    expect(w.find('select').exists()).toBe(false);
  });

  it('chosen collection no longer reachable: the error message, and the list to choose another one (FR-010)', async () => {
    const lost: CollectionSetting = {
      chosen: { id: '33333333-3333-4333-8333-333333333333', name: 'Grenier' },
      seen: null,
    };
    serve({ 'instance/collections': ok(listOf(lost, { missing: true })) });
    const w = await mountField(false, inst({ collection: lost }));
    await openPanel(w);
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
    expect(w.find('select').exists()).toBe(true);
    expect(sent('instance/set-collection')).toEqual([]);
  });

  it.each(['COLLECTIONS_UNAVAILABLE', 'HOMEBOX_UNREACHABLE'] as const)(
    '%s: message and « Réessayer »',
    async (code) => {
      serve({ 'instance/collections': fail(code) });
      const w = await mountField(false);
      await openPanel(w);
      expect(w.text()).toContain(fr[`error.${code}`]);
      serve();
      await button(w, fr['collections.retry']!)!.trigger('click');
      await flushPromises();
      expect(w.find('select').exists()).toBe(true);
    },
  );

  it('save refused (COLLECTION_UNAVAILABLE): the message is shown, nothing announced', async () => {
    serve({ 'instance/set-collection': fail('COLLECTION_UNAVAILABLE') });
    const w = await mountField(false);
    await openPanel(w);
    await w.get('select').setValue(ID_W);
    await button(w, fr['collections.save']!)!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
    expect(w.emitted('changed')).toBeUndefined();
  });
});

describe('connection test names the target collection (FR-007)', () => {
  const view = (instances: InstanceView[]): ConfigView => ({
    configured: true,
    locked: false,
    needsPassphrase: false,
    instances,
    defaultInstanceId: instances[0]!.id,
    maxInstances: 10,
  });

  it('single instance: « Connecté » then « Collection visée : Maison. »', async () => {
    serve({ 'instance/test': ok(view([inst()])) }, () => view([inst()]));
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    await button(w, fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/collections')).toEqual([
      { type: 'instance/collections', instanceId: 'inst-a' },
    ]);
    expect(w.text()).toContain(fr['options.connected']);
    expect(w.get('.collection-note').text()).toBe(tr('collections.testTarget', 'Maison'));
  });

  it('single instance: the chosen collection is named', async () => {
    serve({ 'instance/test': ok(view([inst()])), 'instance/collections': ok(listOf(CHOSEN)) }, () =>
      view([inst()]),
    );
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    await button(w, fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(w.get('.collection-note').text()).toBe(tr('collections.testTarget', 'Atelier'));
  });

  it('a failed test does not read the collections', async () => {
    serve({ 'instance/test': fail('COLLECTION_UNAVAILABLE') }, () => view([inst()]));
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    await button(w, fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/collections')).toEqual([]);
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
  });

  it('several instances: the card announces the collection of ITS instance', async () => {
    const v = view([inst(), B]);
    serve({ 'instance/test': ok(v), 'instance/collections': ok(listOf(CHOSEN)) }, () => v);
    const w = mount(InstancesCard, { props: { view: v }, attachTo: document.body });
    await flushPromises();
    const card = w.get('[data-instance="inst-b"]');
    await card
      .findAll('button')
      .find((b) => b.text() === fr['options.test'])!
      .trigger('click');
    await flushPromises();
    expect(sent('instance/collections')).toEqual([
      { type: 'instance/collections', instanceId: 'inst-b' },
    ]);
    expect(w.get('.instances-announce').text()).toContain(tr('collections.testTarget', 'Atelier'));
  });

  it('several instances: a collection that could not be read is shown as the error of the card', async () => {
    const v = view([inst(), B]);
    serve(
      { 'instance/test': ok(v), 'instance/collections': fail('COLLECTIONS_UNAVAILABLE') },
      () => v,
    );
    const w = mount(InstancesCard, { props: { view: v }, attachTo: document.body });
    await flushPromises();
    const card = w.get('[data-instance="inst-a"]');
    await card
      .findAll('button')
      .find((b) => b.text() === fr['options.test'])!
      .trigger('click');
    await flushPromises();
    expect(w.get('[data-instance="inst-a"]').text()).toContain(fr['error.COLLECTIONS_UNAVAILABLE']);
  });
});

describe('CollectionField: unreadable stored setting (M3)', () => {
  it('the collection error is shown and « Changer » stays available to choose again', async () => {
    serve();
    const w = await mountField(false, inst({ collectionInvalid: true }));
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
    expect(button(w, fr['collections.change']!)).toBeDefined();
  });
});
