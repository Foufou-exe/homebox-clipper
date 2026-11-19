import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/shared/errors';
import { send, type MessageOf, type MessageType } from '@/shared/messages';
import type { ConfigView, UpdateStateView } from '@/shared/types';
import UpdateBanner from '@/ui/components/UpdateBanner.vue';
import PopupApp from '@/ui/popup/App.vue';
import { loadCatalog, makeGetMessage } from './i18n-harness';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

/** Spec 013, Q-U8: update banner (notice and "Update now"). No network call, the link is followed on click only. */
const fr = loadCatalog('fr');
const msg = makeGetMessage(fr);
const NOTES = 'https://github.com/Foufou-exe/homebox-clipper/releases/tag/v0.4.0';

const updateState = (over: Partial<UpdateStateView> = {}): UpdateStateView => ({
  installed: '0.4.0',
  notice: null,
  ready: null,
  blocked: false,
  ...over,
});

type Reply = (m: MessageOf<MessageType>) => unknown;
function serve(replies: Partial<Record<MessageType, unknown>>) {
  vi.mocked(send).mockImplementation(((m: MessageOf<MessageType>) => {
    const r = replies[m.type];
    return Promise.resolve(typeof r === 'function' ? (r as Reply)(m) : r);
  }) as never);
}
const sent = () => vi.mocked(send).mock.calls.map(([m]) => m);

async function banner() {
  const w = mount(UpdateBanner, { attachTo: document.body });
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

describe('UpdateBanner: notice (013, Q-U8, FR-011 to FR-013)', () => {
  it('a status region with the notice and the release notes link, no request without click', async () => {
    serve({ 'update/state': updateState({ notice: '0.4.0' }) });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    const open = vi.spyOn(window, 'open');
    const w = await banner();
    const region = w.get('[role="status"]');
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(region.text()).toContain(msg('update.notice', ['0.4.0']));
    const link = region.get('a');
    expect(link.attributes()).toMatchObject({ href: NOTES, target: '_blank', rel: 'noopener noreferrer' });
    expect(link.attributes('aria-label')).toBe(msg('update.notesAria', ['0.4.0']));
    expect(link.text()).toBe(fr['update.notesLink']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('dismiss: update/dismiss with the version, then hidden', async () => {
    serve({ 'update/state': updateState({ notice: '0.4.0' }), 'update/dismiss': ok(undefined) });
    const w = await banner();
    const close = w.get(`button[aria-label="${fr['update.dismissAria']}"]`);
    await close.trigger('click');
    await flushPromises();
    expect(sent()).toContainEqual({ type: 'update/dismiss', version: '0.4.0' });
    expect(w.text()).not.toContain(msg('update.notice', ['0.4.0']));
  });

  it('after dismissing, the focus moves to the following content', async () => {
    serve({ 'update/state': updateState({ notice: '0.4.0' }), 'update/dismiss': ok(undefined) });
    const Host = defineComponent({ render: () => h('div', [h(UpdateBanner), h('button', { id: 'next' }, 'x')]) });
    const w = mount(Host, { attachTo: document.body });
    await flushPromises();
    await w.get(`button[aria-label="${fr['update.dismissAria']}"]`).trigger('click');
    await flushPromises();
    expect(document.activeElement?.id).toBe('next');
  });

  it('nothing is displayed without notice nor ready version', async () => {
    serve({ 'update/state': updateState() });
    const w = await banner();
    expect(w.text()).toBe('');
    expect(w.find('button').exists()).toBe(false);
  });
});

describe('UpdateBanner: "Update now" (013, Q-U8, FR-014, FR-015)', () => {
  it('ready: text, button and help; a click sends update/apply', async () => {
    serve({ 'update/state': updateState({ ready: '0.5.0' }), 'update/apply': { applied: true } });
    const w = await banner();
    expect(w.text()).toContain(msg('update.ready', ['0.5.0']));
    expect(w.text()).toContain(fr['update.applyHelp']);
    const button = w.findAll('button').find((b) => b.text() === fr['update.applyButton'])!;
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    expect(sent()).toContainEqual({ type: 'update/apply' });
    expect(w.text()).not.toContain(fr['update.blocked']);
  });

  it('busy answer → blocked state', async () => {
    serve({ 'update/state': updateState({ ready: '0.5.0' }), 'update/apply': { applied: false, reason: 'busy' } });
    const w = await banner();
    const button = () => w.findAll('button').find((b) => b.text() === fr['update.applyButton'])!;
    await button().trigger('click');
    await flushPromises();
    expect(button().attributes('disabled')).toBeDefined();
    expect(w.text()).toContain(fr['update.blocked']);
  });

  it('blocked: disabled button described by the reason', async () => {
    serve({ 'update/state': updateState({ ready: '0.5.0', blocked: true }) });
    const w = await banner();
    const button = w.findAll('button').find((b) => b.text() === fr['update.applyButton'])!;
    expect(button.attributes('disabled')).toBeDefined();
    const reason = w.findAll('p').find((p) => p.text() === fr['update.blocked'])!;
    expect(reason.attributes('id')).toBeTruthy();
    expect(button.attributes('aria-describedby')?.split(' ')).toContain(reason.attributes('id'));
  });

  it.each([
    ['undefined', undefined],
    ['empty object', {}],
    ['a result', { ok: true }],
    ['a configuration view', { configured: false }],
    ['a notice that is not a version', { installed: '0.4.0', notice: '<b>x</b>', ready: null, blocked: false }],
  ])('malformed answer (%s): nothing displayed, no exception', async (_l, answer) => {
    serve({ 'update/state': answer });
    const w = await banner();
    expect(w.text()).toBe('');
  });

  it('a rejected update/state displays nothing', async () => {
    vi.mocked(send).mockRejectedValue(new Error('no receiver'));
    const w = await banner();
    expect(w.text()).toBe('');
  });

  it('the banner is shown on the locked popup screen too', async () => {
    // ADAPTED (016, T100): the instance carries the address (no top-level compatibility fields).
    const locked: ConfigView = {
      configured: true,
      instances: [{ id: 'inst-a', name: 'homebox.example.com', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••a1b2', lastCheck: null, keyState: 'locked' }],
      defaultInstanceId: 'inst-a',
      locked: true,
    };
    serve({ 'session/open': locked, 'update/state': updateState({ notice: '0.4.0' }) });
    const w = mount(PopupApp, { attachTo: document.body });
    await flushPromises();
    expect(w.find('.content [role="status"]').text()).toContain(msg('update.notice', ['0.4.0']));
    expect(w.find('input[type="password"]').exists()).toBe(true);
  });

  it('keyboard: visible focus on the link and the buttons', () => {
    const src = readFileSync(resolve(__dirname, '../../src/ui/components/UpdateBanner.vue'), 'utf8');
    const style = src.slice(src.indexOf('<style'));
    expect(style).toMatch(/focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\)/);
    for (const cls of ['notes', 'close', 'apply']) expect(style, cls).toContain(`.${cls}:focus-visible`);
    const src2 = src.slice(0, src.indexOf('<style'));
    expect(src2).toMatch(/<a[^>]*class="notes"/);
    expect(src2).toMatch(/<button[^>]*class="close"/);
    expect(src2).toMatch(/<button[^>]*class="apply"/);
  });
});
