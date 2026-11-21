import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { requestOrigin } from '@/platform';
import { fail, ok } from '@/shared/errors';
import { send, type MessageOf, type MessageType } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import OptionsApp from '@/ui/options/App.vue';
import { loadCatalog } from './i18n-harness';

/**
 * Spec 017 (Firefox support), contracts/browser-compat.md §2: the origin permission is requested inside the user
 * gesture. Firefox (like Chrome) only shows the prompt when `permissions.request` is called in the click handler,
 * before any `await`: in each of the 4 handlers, `requestOrigin` must be called synchronously when the event is
 * dispatched, and before any message to the background. A refusal sends nothing and shows PERMISSION_DENIED.
 * Non-regression test (the code already complies); validated by a temporary mutation (an `await` added before the
 * call makes it fail). Fictitious values only.
 */

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));
vi.mock('@/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform')>()),
  requestOrigin: vi.fn(),
}));

const fr = loadCatalog('fr');
const ORIGIN = 'https://homebox.example.com';
const API_KEY = 'hb_xxxxxxxx';
const PASSPHRASE = 'phrase de test 123';

const inst = (over: Partial<InstanceView> = {}): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: ORIGIN,
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...over,
});
const view = (instances: InstanceView[], over: Partial<ConfigView> = {}): ConfigView => ({
  configured: instances.length > 0,
  locked: false,
  needsPassphrase: false,
  instances,
  defaultInstanceId: instances[0]?.id ?? null,
  maxInstances: 10,
  ...over,
});

type Reply = (msg: MessageOf<MessageType>) => unknown;
function serve(current: ConfigView, replies: Partial<Record<MessageType, unknown | Reply>> = {}) {
  vi.mocked(send).mockImplementation(((msg: MessageOf<MessageType>) => {
    if (msg.type in replies) {
      const r = replies[msg.type];
      return Promise.resolve(typeof r === 'function' ? (r as Reply)(msg) : r);
    }
    if (msg.type === 'config/get' || msg.type === 'session/open') return Promise.resolve(current);
    if (msg.type === 'session/get-policy')
      return Promise.resolve({ v: 1, policy: 'browser-close' });
    if (msg.type === 'history/list')
      return Promise.resolve(ok({ state: 'locked', enabled: true, entries: [] }));
    return Promise.resolve(ok(undefined));
  }) as never);
}
const sent = (type: MessageType) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m)
    .filter((m) => m.type === type);

async function options() {
  const w = mount(OptionsApp, { attachTo: document.body });
  await flushPromises();
  return w;
}
const buttons = (w: VueWrapper, text: string) =>
  w.findAll('button').filter((b) => b.text() === text);
const card = (w: VueWrapper, name: string) =>
  w.findAll('section[role="group"]').find((c) => c.get('h2').text() === name)!;

/**
 * Dispatches the gesture WITHOUT awaiting it and checks, in the same synchronous turn, that the permission was
 * requested and that nothing was sent to the background before it; then lets the handler finish.
 */
async function gesture(fire: () => unknown) {
  const sendsBefore = vi.mocked(send).mock.calls.length;
  void fire();
  expect(requestOrigin).toHaveBeenCalledTimes(1);
  expect(requestOrigin).toHaveBeenCalledWith(ORIGIN);
  expect(vi.mocked(send).mock.calls.length).toBe(sendsBefore);
  await flushPromises();
  const requestedAt = vi.mocked(requestOrigin).mock.invocationCallOrder[0]!;
  const sentAfter = vi.mocked(send).mock.invocationCallOrder.slice(sendsBefore);
  for (const order of sentAfter) expect(order).toBeGreaterThan(requestedAt);
}

/** The 4 handlers, each set up up to the point where the user clicks. */
const HANDLERS: Record<
  string,
  { setup: () => Promise<{ w: VueWrapper; fire: () => unknown }>; write?: MessageType }
> = {
  'InstanceForm.vue submit (add an instance)': {
    write: 'instance/add',
    async setup() {
      serve(view([]), { 'instance/add': ok(view([inst()])) });
      const w = await options();
      const form = w.get('form.instance-form');
      await form.get('input[name="baseUrl"]').setValue(ORIGIN);
      await form.get('input[name="apiKey"]').setValue(API_KEY);
      await form.get('input[name="passphrase"]').setValue(PASSPHRASE);
      await form.get('input[name="confirmation"]').setValue(PASSPHRASE);
      return { w, fire: () => form.trigger('submit') };
    },
  },
  'InstanceForm.vue submitEdit (new origin)': {
    write: 'instance/update',
    async setup() {
      serve(view([inst({ baseUrl: 'https://ancienne.example.com' })]), {
        'instance/update': ok(view([inst()])),
      });
      const w = await options();
      const form = w.findAll('form').find((f) => f.find('#baseUrl').exists())!;
      await form.get('#baseUrl').setValue(ORIGIN);
      await form.get('#passphrase').setValue(PASSPHRASE);
      return { w, fire: () => form.trigger('submit') };
    },
  },
  'InstancesCard.vue requestAccess (« Redemander l’accès » on a card)': {
    async setup() {
      const B = inst({ id: 'inst-b', name: 'Atelier', baseUrl: 'https://inventaire.example.org' });
      serve(view([B, inst()]), { 'instance/test': fail('PERMISSION_DENIED') });
      const w = await options();
      await card(w, 'Maison')
        .findAll('button')
        .find((b) => b.text() === fr['options.test'])!
        .trigger('click');
      await flushPromises();
      const again = card(w, 'Maison')
        .findAll('button')
        .find((b) => b.text() === fr['instances.requestAccess'])!;
      return { w, fire: () => again.trigger('click') };
    },
  },
  'options/App.vue requestAccess (single instance)': {
    async setup() {
      serve(view([inst()]), { 'instance/test': fail('PERMISSION_DENIED') });
      const w = await options();
      await buttons(w, fr['options.test']!)[0]!.trigger('click');
      await flushPromises();
      const again = buttons(w, fr['instances.requestAccess']!);
      expect(again).toHaveLength(1);
      return { w, fire: () => again[0]!.trigger('click') };
    },
  },
};

beforeEach(() => {
  fakeBrowser.reset();
  // vitest.config.ts has mockReset: true: the behaviour is set again before every test.
  vi.mocked(requestOrigin).mockResolvedValue(true);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('permission requested inside the user gesture, before any await (017, browser-compat §2)', () => {
  it.each(Object.keys(HANDLERS))(
    '%s: requestOrigin in the synchronous turn of the event, before any send',
    async (key) => {
      const handler = HANDLERS[key]!;
      const { fire } = await handler.setup();
      vi.mocked(requestOrigin).mockClear();
      await gesture(fire);
      if (handler.write) expect(sent(handler.write)).toHaveLength(1);
    },
  );

  it.each(Object.keys(HANDLERS))(
    '%s: a refusal sends nothing and keeps the access message',
    async (key) => {
      const handler = HANDLERS[key]!;
      const { w, fire } = await handler.setup();
      vi.mocked(requestOrigin).mockClear();
      vi.mocked(requestOrigin).mockResolvedValue(false);
      await gesture(fire);
      if (handler.write) expect(sent(handler.write)).toHaveLength(0);
      expect(w.text()).toContain(fr['error.PERMISSION_DENIED']);
    },
  );
});
