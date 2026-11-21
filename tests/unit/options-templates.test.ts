import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import DefaultTemplateField from '@/ui/options/DefaultTemplateField.vue';
import InstancesCard from '@/ui/options/InstancesCard.vue';
import { loadCatalog } from './i18n-harness';

/** Default template per instance in the settings (spec 018, Q-U4, contracts/ui.md §3). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
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
const LIST = {
  templates: [
    { id: 'tpl-2', name: 'Jeu', description: '' },
    { id: 'tpl-1', name: 'Livre', description: '' },
  ],
  defaultTemplate: { id: 'tpl-1', name: 'Livre' },
  defaultState: 'ok',
};

type Replies = Partial<Record<string, unknown | ((msg: Record<string, unknown>) => unknown)>>;
function serve(replies: Replies = {}) {
  vi.mocked(send).mockImplementation(((msg: Record<string, unknown>) => {
    const r = replies[msg.type as string];
    if (r !== undefined)
      return Promise.resolve(
        typeof r === 'function' ? (r as (m: Record<string, unknown>) => unknown)(msg) : r,
      );
    if (msg.type === 'template/get-default') return Promise.resolve(ok({ defaultTemplate: null }));
    if (msg.type === 'template/list') return Promise.resolve(ok(LIST));
    if (msg.type === 'template/set-default')
      return Promise.resolve(
        ok({ defaultTemplate: msg.templateId ? { id: msg.templateId, name: 'Livre' } : null }),
      );
    return Promise.resolve(ok(undefined));
  }) as never);
}
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m as unknown as Record<string, unknown>)
    .filter((m) => m.type === type);
const mountField = async (locked: boolean, instance = inst()) => {
  const w = mount(DefaultTemplateField, { props: { instance, locked }, attachTo: document.body });
  await flushPromises();
  return w;
};
const button = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => b.text() === text);

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('DefaultTemplateField: locked (US4-6, FR-025)', () => {
  it('shows the remembered name (template/get-default) and « unlock to change », without any active control', async () => {
    serve({ 'template/get-default': ok({ defaultTemplate: { id: 'tpl-1', name: 'Livre' } }) });
    const w = await mountField(true);
    expect(sent('template/get-default')).toEqual([
      { type: 'template/get-default', instanceId: 'inst-a' },
    ]);
    expect(w.text()).toContain(fr['templates.defaultLabel']);
    expect(w.text()).toContain('Livre');
    expect(w.text()).toContain(fr['templates.unlockToChange']);
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.find('select').exists()).toBe(false);
    expect(sent('template/list')).toEqual([]);
  });

  it('no default: « Aucun »', async () => {
    serve();
    const w = await mountField(true);
    expect(w.text()).toContain(fr['templates.none']);
  });
});

describe('DefaultTemplateField: unlocked (US4-1)', () => {
  it('« Changer » (aria-expanded) loads the list of this instance; save → template/set-default, announced', async () => {
    serve();
    const w = await mountField(false, B);
    const change = button(w, fr['templates.change']!)!;
    expect(change.attributes('aria-expanded')).toBe('false');
    await change.trigger('click');
    await flushPromises();
    expect(change.attributes('aria-expanded')).toBe('true');
    expect(sent('template/list')).toEqual([{ type: 'template/list', instanceId: 'inst-b' }]);
    const select = w.get('select');
    expect(w.get(`label[for="${select.attributes('id')}"]`).text()).toBe(
      fr['templates.defaultLabel'],
    );
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      fr['templates.none'],
      'Jeu',
      'Livre',
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('tpl-1');
    await select.setValue('tpl-2');
    await button(w, fr['templates.save']!)!.trigger('click');
    await flushPromises();
    expect(sent('template/set-default')).toEqual([
      { type: 'template/set-default', instanceId: 'inst-b', templateId: 'tpl-2' },
    ]);
    expect(w.get('output').text()).toBe(fr['templates.defaultSaved']);
  });

  it('« Aucun » → templateId null', async () => {
    serve();
    const w = await mountField(false);
    await button(w, fr['templates.change']!)!.trigger('click');
    await flushPromises();
    await w.get('select').setValue('');
    await button(w, fr['templates.save']!)!.trigger('click');
    await flushPromises();
    expect(sent('template/set-default')).toEqual([
      { type: 'template/set-default', instanceId: 'inst-a', templateId: null },
    ]);
  });

  it('instance without template: « Aucun modèle sur cette instance », no list', async () => {
    serve({ 'template/list': ok({ templates: [], defaultTemplate: null, defaultState: 'none' }) });
    const w = await mountField(false);
    await button(w, fr['templates.change']!)!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain(fr['templates.noneOnInstance']);
    expect(w.find('select').exists()).toBe(false);
  });

  it('default deleted in HomeBox: « defaultMissing »', async () => {
    serve({
      'template/list': ok({
        ...LIST,
        defaultTemplate: { id: 'tpl-9', name: 'Ancien' },
        defaultState: 'missing',
      }),
    });
    const w = await mountField(false);
    await button(w, fr['templates.change']!)!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain(fr['templates.defaultMissing']);
  });
});

describe('DefaultTemplateField in the instance cards (≥ 2 instances)', () => {
  it('one field per card, each with its own instance; never the templates of another one', async () => {
    serve({
      'template/list': (m: Record<string, unknown>) =>
        ok({
          ...LIST,
          templates: m.instanceId === 'inst-b' ? [LIST.templates[0]] : LIST.templates,
        }),
    });
    const view: ConfigView = {
      configured: true,
      locked: false,
      needsPassphrase: false,
      instances: [inst(), B],
      defaultInstanceId: 'inst-a',
      maxInstances: 10,
    };
    const w = mount(InstancesCard, { props: { view }, attachTo: document.body });
    await flushPromises();
    const fields = w.findAllComponents(DefaultTemplateField);
    expect(fields.map((f) => f.props('instance').id)).toEqual(['inst-a', 'inst-b']);
    expect(sent('template/get-default').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
    await button(fields[1]!, fr['templates.change']!)!.trigger('click');
    await flushPromises();
    expect(sent('template/list')).toEqual([{ type: 'template/list', instanceId: 'inst-b' }]);
    expect(fields[1]!.findAll('option').map((o) => o.text())).toEqual([
      fr['templates.none'],
      'Jeu',
    ]);
    expect(fields[0]!.find('select').exists()).toBe(false);
  });
});

describe('DefaultTemplateField: errors', () => {
  it('list error: ErrorBanner + « Réessayer » which reloads the list', async () => {
    serve({ 'template/list': fail('HOMEBOX_UNREACHABLE') });
    const w = await mountField(false);
    await button(w, fr['templates.change']!)!.trigger('click');
    await flushPromises();
    expect(w.text()).toContain(fr['error.HOMEBOX_UNREACHABLE']);
    await button(w, fr['templates.retry']!)!.trigger('click');
    await flushPromises();
    expect(sent('template/list')).toHaveLength(2);
  });
});
