import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { InstanceView } from '@/shared/types';
import OrderLinkSettings from '@/ui/options/OrderLinkSettings.vue';
import { loadCatalog } from './i18n-harness';

/** Order page link setting per instance in the settings (spec 025, Q-U2, contracts/ui.md §1). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const en = loadCatalog('en');
const inst = (over: Partial<InstanceView> = {}): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...over,
});

let stored: Record<string, { enabled: boolean }> = {};
function serve(over: Record<string, (m: Record<string, unknown>) => unknown> = {}) {
  vi.mocked(send).mockImplementation(((msg: Record<string, unknown>) => {
    const custom = over[msg.type as string];
    if (custom) return Promise.resolve(custom(msg));
    if (msg.type === 'order-link/get')
      return Promise.resolve(
        ok({ settings: stored[msg.instanceId as string] ?? { enabled: false } }),
      );
    if (msg.type === 'order-link/set') {
      stored[msg.instanceId as string] = msg.settings as { enabled: boolean };
      return Promise.resolve(ok({ settings: msg.settings }));
    }
    return Promise.resolve(ok(undefined));
  }) as never);
}
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m as unknown as Record<string, unknown>)
    .filter((m) => m.type === type);
const mountField = async (locked = false, instance = inst()) => {
  const w = mount(OrderLinkSettings, { props: { instance, locked }, attachTo: document.body });
  await flushPromises();
  return w;
};
const box = (w: Awaited<ReturnType<typeof mountField>>) =>
  w.get<HTMLInputElement>('input[type="checkbox"]');

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
  stored = {};
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('order link setting (spec 025)', () => {
  it('S1: off by default; reads the setting of this instance only', async () => {
    serve();
    const w = await mountField();
    expect(box(w).element.checked).toBe(false);
    expect(sent('order-link/get')).toEqual([{ type: 'order-link/get', instanceId: 'inst-a' }]);
    expect(w.get('label').text()).toBe(fr['orderLink.optionLabel']);
  });

  it('S2: the help says the link points to the merchant site and is stored in HomeBox (EN and FR)', () => {
    expect(en['orderLink.optionHelp']).toMatch(/stored in HomeBox/);
    expect(en['orderLink.optionHelp']).toMatch(/off by default/i);
    expect(fr['orderLink.optionHelp']).toMatch(/enregistré dans HomeBox/);
    expect(fr['orderLink.optionHelp']).toMatch(/désactivé par défaut/i);
  });

  it('S3: the help is shown and tied to the box (aria-describedby)', async () => {
    serve();
    const w = await mountField();
    const id = box(w).attributes('aria-describedby')!;
    expect(w.get(`#${CSS.escape(id)}`).text()).toBe(fr['orderLink.optionHelp']);
  });

  it('S4: checking then saving sends order-link/set for this instance', async () => {
    serve();
    const w = await mountField();
    await box(w).setValue(true);
    await w.get('button').trigger('click');
    await flushPromises();
    expect(sent('order-link/set')).toEqual([
      { type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: true } },
    ]);
    expect(w.get('output').text()).toBe(fr['orderLink.saved']);
  });

  it('S5: a stored setting is shown checked', async () => {
    stored = { 'inst-a': { enabled: true } };
    serve();
    const w = await mountField();
    expect(box(w).element.checked).toBe(true);
  });

  it('S6: works locked (no key, no network message other than get/set)', async () => {
    serve();
    const w = await mountField(true);
    await box(w).setValue(true);
    await w.get('button').trigger('click');
    await flushPromises();
    expect(sent('order-link/set')).toHaveLength(1);
    const types = vi.mocked(send).mock.calls.map(([m]) => (m as { type: string }).type);
    expect(new Set(types)).toEqual(new Set(['order-link/get', 'order-link/set']));
  });

  it('S7: a failed save shows the error and no confirmation', async () => {
    serve({ 'order-link/set': () => fail('INSTANCE_NOT_FOUND') });
    const w = await mountField();
    await box(w).setValue(true);
    await w.get('button').trigger('click');
    await flushPromises();
    expect(w.find('output').text()).toBe('');
    expect(w.text()).toContain(fr['error.INSTANCE_NOT_FOUND']!.slice(0, 20));
  });

  it('S8: a failed read keeps the default (off)', async () => {
    serve({ 'order-link/get': () => fail('BAD_MESSAGE') });
    const w = await mountField();
    expect(box(w).element.checked).toBe(false);
  });

  it('S9: another instance has its own setting', async () => {
    stored = { 'inst-b': { enabled: true } };
    serve();
    const a = await mountField(false, inst());
    const b = await mountField(false, inst({ id: 'inst-b', name: 'Atelier' }));
    expect(box(a).element.checked).toBe(false);
    expect(box(b).element.checked).toBe(true);
  });
});
