import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { LOCK_POLICIES } from '@/shared/lock-policy';
import { send, type MessageOf, type MessageType } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import LockCard from '@/ui/options/LockCard.vue';
import OptionsApp from '@/ui/options/App.vue';
import PopupApp from '@/ui/popup/App.vue';
import UnlockView from '@/ui/popup/UnlockView.vue';
import { loadCatalog } from './i18n-harness';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

/** Spec 013, Q-U7, Q-U10: "Automatic lock" card, session/open and presence port. */
const fr = loadCatalog('fr');
const POLICY_KEYS = {
  'browser-close': 'lock.policy.browserClose',
  'idle-15m': 'lock.policy.idle15m',
  'idle-1h': 'lock.policy.idle1h',
  'idle-4h': 'lock.policy.idle4h',
  'every-open': 'lock.policy.everyOpen',
} as const;

const view = (over: Partial<ConfigView> = {}): ConfigView => ({
  configured: true,
  // ADAPTED (016): the view lists the instances and names the default one (the target of the messages).
  instances: [{ id: 'inst-a', name: 'homebox.example.com', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••a1b2', lastCheck: null, keyState: 'ready' }],
  defaultInstanceId: 'inst-a',
  // ADAPTED (016, T100): no top-level compatibility fields (baseUrl, maskedKey, lastCheck) any more.
  locked: false,
  needsPassphrase: false,
  ...over,
});

type Reply = (msg: MessageOf<MessageType>) => unknown;
function serve(replies: Partial<Record<MessageType, unknown | Reply>>) {
  vi.mocked(send).mockImplementation(((msg: MessageOf<MessageType>) => {
    const r = replies[msg.type];
    return Promise.resolve(typeof r === 'function' ? (r as Reply)(msg) : r);
  }) as never);
}
const sent = () => vi.mocked(send).mock.calls.map(([m]) => m);

async function card() {
  const w = mount(LockCard, { attachTo: document.body });
  await flushPromises();
  return w;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('LockCard (013, Q-U7, FR-001 to FR-003, FR-008)', () => {
  it('a card with a heading, a fieldset with legend and exactly five radios in LOCK_POLICIES order', async () => {
    serve({ 'session/get-policy': { v: 1, policy: 'browser-close' } });
    const w = await card();
    expect(w.element.tagName).toBe('SECTION');
    expect(w.classes()).toContain('card');
    expect(w.get('h2').text()).toBe(fr['lock.settings.title']);
    expect(w.text()).toContain(fr['lock.settings.intro']);
    expect(w.get('fieldset legend').text()).toBe(fr['lock.settings.legend']);
    const radios = w.findAll('input');
    expect(radios).toHaveLength(5);
    expect(radios.every((r) => r.attributes('type') === 'radio')).toBe(true);
    expect(radios.map((r) => r.attributes('value'))).toEqual([...LOCK_POLICIES]);
    for (const r of radios) {
      expect(r.element.closest('label')?.textContent?.trim()).toBe(
        fr[POLICY_KEYS[r.attributes('value') as keyof typeof POLICY_KEYS]],
      );
    }
    expect(w.find('input[type="number"], input[type="text"], select').exists()).toBe(false);
    expect(w.text()).not.toMatch(/\bnever\b/);
  });

  it('the "no never" explanation is always visible and described for the group; inactivity help present', async () => {
    serve({ 'session/get-policy': { v: 1, policy: 'idle-1h' } });
    const w = await card();
    const why = w.findAll('p').find((p) => p.text() === fr['lock.settings.whyNoNever'])!;
    expect(why.exists()).toBe(true);
    expect(why.attributes('id')).toBeTruthy();
    const describedBy = w.get('fieldset').attributes('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(why.attributes('id'));
    expect(w.text()).toContain(fr['lock.settings.inactivityHelp']);
  });

  it('loads the stored choice with session/get-policy', async () => {
    serve({ 'session/get-policy': { v: 1, policy: 'idle-4h' } });
    const w = await card();
    expect(sent()).toEqual([{ type: 'session/get-policy' }]);
    expect((w.get('input[value="idle-4h"]').element as HTMLInputElement).checked).toBe(true);
  });

  it("the user's choice made before the answer is not overwritten", async () => {
    let resolve!: (v: unknown) => void;
    serve({
      'session/get-policy': () => new Promise((r) => (resolve = r)),
      'session/set-policy': (m: unknown) => ok({ v: 1, policy: (m as { policy: string }).policy }),
    });
    const w = mount(LockCard, { attachTo: document.body });
    await w.get('input[value="idle-15m"]').setValue(true);
    resolve({ v: 1, policy: 'browser-close' });
    await flushPromises();
    expect((w.get('input[value="idle-15m"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('a change sends session/set-policy without passphrase; success announced in a status region', async () => {
    serve({
      'session/get-policy': { v: 1, policy: 'browser-close' },
      'session/set-policy': ok({ v: 1, policy: 'idle-15m' }),
    });
    const w = await card();
    await w.get('input[value="idle-15m"]').setValue(true);
    await flushPromises();
    expect(sent()).toContainEqual({ type: 'session/set-policy', policy: 'idle-15m' });
    expect(JSON.stringify(sent())).not.toMatch(/passphrase/);
    expect(w.get('[role="status"]').text()).toBe(fr['lock.settings.saved']);
    expect(w.find('[role="alert"]').exists()).toBe(false);
  });

  it('failure: alert and back to the previous choice', async () => {
    serve({
      'session/get-policy': { v: 1, policy: 'idle-1h' },
      'session/set-policy': fail('BAD_MESSAGE'),
    });
    const w = await card();
    await w.get('input[value="every-open"]').setValue(true);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe(fr['lock.settings.saveFailed']);
    expect((w.get('input[value="idle-1h"]').element as HTMLInputElement).checked).toBe(true);
    expect((w.get('input[value="every-open"]').element as HTMLInputElement).checked).toBe(false);
  });

  it('a malformed get-policy answer keeps the default', async () => {
    serve({ 'session/get-policy': undefined });
    const w = await card();
    expect((w.get('input[value="browser-close"]').element as HTMLInputElement).checked).toBe(true);
  });

  it.each([
    ['locked', view({ locked: true })],
    ['unlocked', view({ locked: false })],
    ['not configured', { configured: false }],
  ])(
    'options page (%s): the card is shown just after the configuration card and before history',
    async (_n, v) => {
      serve({
        'session/open': v,
        'config/get': v,
        'session/get-policy': { v: 1, policy: 'browser-close' },
      });
      const w = mount(OptionsApp, { attachTo: document.body });
      await flushPromises();
      const titles = w.findAll('h1, h2').map((h) => h.text());
      expect(titles[0]).toBe(fr['options.title']);
      expect(titles[1]).toBe(fr['lock.settings.title']);
      expect(titles.indexOf(fr['lock.settings.title']!)).toBeLessThan(
        titles.indexOf(fr['options.historyTitle']!),
      );
      expect(w.find('fieldset input[value="idle-1h"]').exists()).toBe(true);
    },
  );
});

describe('session/open and presence port (013, Q-U10)', () => {
  it('the popup sends session/open instead of the first config/get, then opens the ui-presence port', async () => {
    serve({ 'session/open': { configured: false } });
    const connect = vi.fn(() => ({ disconnect: vi.fn() }));
    vi.spyOn(fakeBrowser.runtime, 'connect').mockImplementation(connect as never);
    const w = mount(PopupApp);
    await flushPromises();
    // UpdateBanner (a child) asks for its state first: the page's first configuration message is session/open.
    expect(sent().find((m) => m.type === 'session/open' || m.type === 'config/get')).toEqual({
      type: 'session/open',
    });
    expect(sent().some((m) => m.type === 'config/get')).toBe(false);
    expect(connect).toHaveBeenCalledWith({ name: 'ui-presence' });
    expect(w.text()).toContain(fr['popup.configureButton']);
  });

  it('the popup is displayed even if connect throws', async () => {
    serve({ 'session/open': { configured: false } });
    vi.spyOn(fakeBrowser.runtime, 'connect').mockImplementation(() => {
      throw new Error('not available');
    });
    const w = mount(PopupApp);
    await flushPromises();
    expect(w.text()).toContain(fr['popup.configureButton']);
  });

  it('the options page loads with session/open, then refresh() stays config/get; connect is called', async () => {
    const v = view();
    serve({
      'session/open': v,
      'config/get': v,
      // ADAPTED (016, T079): config/test is withdrawn; the test button sends instance/test for the single instance.
      'instance/test': ok(v),
      'session/get-policy': { v: 1, policy: 'browser-close' },
    });
    const connect = vi.fn(() => ({ disconnect: vi.fn() }));
    vi.spyOn(fakeBrowser.runtime, 'connect').mockImplementation(connect as never);
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    // LockCard (a child) is mounted first and asks for its setting: the page's first configuration message is session/open.
    expect(sent().find((m) => m.type === 'session/open' || m.type === 'config/get')).toEqual({
      type: 'session/open',
    });
    expect(sent().filter((m) => m.type === 'session/open')).toHaveLength(1);
    expect(connect).toHaveBeenCalledWith({ name: 'ui-presence' });
    const before = sent().filter((m) => m.type === 'config/get').length;
    await w
      .findAll('button')
      .find((b) => b.text() === fr['options.test'])!
      .trigger('click');
    await flushPromises();
    expect(sent().filter((m) => m.type === 'config/get').length).toBe(before + 1);
    expect(sent().filter((m) => m.type === 'session/open')).toHaveLength(1);
  });

  it('the options page is displayed even if connect throws', async () => {
    serve({ 'session/open': view(), 'session/get-policy': { v: 1, policy: 'browser-close' } });
    vi.spyOn(fakeBrowser.runtime, 'connect').mockImplementation(() => {
      throw new Error('not available');
    });
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    expect(w.text()).toContain(fr['options.unlocked']);
  });

  it('the options page refreshes its state when it becomes visible again (lock that happened while hidden)', async () => {
    let current = view({ locked: false });
    serve({
      'session/open': () => current,
      'config/get': () => current,
      'session/get-policy': { v: 1, policy: 'idle-15m' },
    });
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    expect(w.text()).toContain(fr['options.unlocked']);
    current = view({ locked: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(sent().filter((m) => m.type === 'config/get').length).toBeGreaterThan(0);
    expect(w.text()).toContain(fr['options.locked']);
  });
});

describe('UnlockView with several instances (016, US5, T089)', () => {
  const B = { id: 'inst-b', name: 'Atelier', baseUrl: 'https://inventaire.example.org', maskedKey: 'hb_••••bbbb', lastCheck: null, keyState: 'locked' as const };
  const A = { ...view().instances![0]!, keyState: 'locked' as const };

  it('one instance: unchanged (the badge of the instance, no « all instances » text)', () => {
    const w = mount(UnlockView, { props: { config: view({ locked: true, instances: [A] }) } });
    expect(w.find('.instance').exists()).toBe(true);
    expect(w.text()).toContain('https://homebox.example.com');
    expect(w.text()).not.toContain('Déverrouille vos');
  });

  it('two instances: « Déverrouille vos 2 instances HomeBox. » instead of the badge of one instance', () => {
    const w = mount(UnlockView, { props: { config: view({ locked: true, instances: [A, B] }) } });
    expect(w.find('.instance').exists()).toBe(false);
    expect(w.text()).toContain('Déverrouille vos 2 instances HomeBox.');
    expect(w.text()).not.toContain('https://homebox.example.com');
  });

  it('one unlock makes every instance ready: the view of session/unlock is emitted as is', async () => {
    const unlocked = view({ locked: false, instances: [{ ...A, keyState: 'ready' }, { ...B, keyState: 'ready' }] });
    serve({ 'session/unlock': ok(unlocked) });
    const w = mount(UnlockView, { props: { config: view({ locked: true, instances: [A, B] }) } });
    await w.get('input[type="password"]').setValue('phrase de test 123');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(sent()).toEqual([{ type: 'session/unlock', passphrase: 'phrase de test 123' }]);
    const emitted = w.emitted('unlocked')![0]![0] as ConfigView;
    expect(emitted.instances!.map((i) => i.keyState)).toEqual(['ready', 'ready']);
  });
});
