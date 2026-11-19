import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { requestOrigin } from '@/platform';
import { fail, ok } from '@/shared/errors';
import { send, type MessageOf, type MessageType } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import OptionsApp from '@/ui/options/App.vue';
import InstancesCard from '@/ui/options/InstancesCard.vue';
import { loadCatalog, makeGetMessage, setTestLanguage } from './i18n-harness';

/** Spec 016, delivery B, Q-U5: the instances in the options (part "add", US2, T059). Fictitious values only. */

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));
vi.mock('@/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform')>()),
  requestOrigin: vi.fn(),
}));

const fr = loadCatalog('fr');
const tr = makeGetMessage(fr);
const PASSPHRASE = 'phrase de test 123';

const inst = (over: Partial<InstanceView> = {}): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...over,
});
const B = inst({
  id: 'inst-b',
  name: 'Atelier',
  baseUrl: 'https://inventaire.example.org',
  maskedKey: 'hb_••••bbbb',
});
const view = (instances: InstanceView[], over: Partial<ConfigView> = {}): ConfigView => ({
  configured: true,
  locked: false,
  needsPassphrase: false,
  instances,
  defaultInstanceId: instances[0]?.id ?? null,
  maxInstances: 10,
  ...over,
});

type Reply = (msg: MessageOf<MessageType>) => unknown;
let order: string[] = [];
function serve(
  current: () => ConfigView,
  replies: Partial<Record<MessageType, unknown | Reply>> = {},
) {
  vi.mocked(send).mockImplementation(((msg: MessageOf<MessageType>) => {
    order.push(`send:${msg.type}`);
    if (msg.type in replies) {
      const r = replies[msg.type];
      return Promise.resolve(typeof r === 'function' ? (r as Reply)(msg) : r);
    }
    if (msg.type === 'config/get' || msg.type === 'session/open') return Promise.resolve(current());
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
const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text() === text);
const addButton = (w: VueWrapper) => button(w, fr['instances.add']!)!;
async function openForm(w: VueWrapper) {
  await addButton(w).trigger('click');
  await flushPromises();
  return w.get('form.instance-form');
}
async function fill(
  w: VueWrapper,
  values: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    passphrase?: string;
    confirmation?: string;
  },
) {
  const form = w.get('form.instance-form');
  if (values.name !== undefined) await form.get('input[name="name"]').setValue(values.name);
  if (values.baseUrl !== undefined)
    await form.get('input[name="baseUrl"]').setValue(values.baseUrl);
  if (values.apiKey !== undefined) await form.get('input[name="apiKey"]').setValue(values.apiKey);
  if (values.passphrase !== undefined)
    await form.get('input[name="passphrase"]').setValue(values.passphrase);
  if (values.confirmation !== undefined)
    await form.get('input[name="confirmation"]').setValue(values.confirmation);
}
async function submit(w: VueWrapper) {
  await w.get('form.instance-form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  fakeBrowser.reset();
  order = [];
  vi.mocked(send).mockReset();
  vi.mocked(requestOrigin).mockReset();
  vi.mocked(requestOrigin).mockImplementation(async (origin: string) => {
    order.push(`requestOrigin:${origin}`);
    return true;
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('options: list of the instances (016, US2, T059 a)', () => {
  it('two instances: one card per instance with name, address, masked key and badge, under « Instances HomeBox »', async () => {
    serve(() => view([inst(), B]));
    const w = await options();
    expect(w.get('h1').text()).toBe(fr['options.instancesTitle']);
    const cards = w.findAll('section[role="group"]');
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.attributes('aria-label'))).toEqual([
      tr('instances.cardAria', ['Maison']),
      tr('instances.cardAria', ['Atelier']),
    ]);
    expect(cards[0]!.get('h2').text()).toBe('Maison');
    expect(cards[0]!.text()).toContain('https://homebox.example.com');
    expect(cards[0]!.text()).toContain('hb_••••xxxx');
    expect(cards[1]!.get('h2').text()).toBe('Atelier');
    expect(cards[1]!.text()).toContain('https://inventaire.example.org');
    expect(cards[1]!.find('.instance').exists()).toBe(true); // InstanceBadge
  });
});

describe('options: adding an instance (016, US2, T059 b–e)', () => {
  it('(b) order inside the click: local checks → requestOrigin → send(instance/add)', async () => {
    let current = view([inst()]);
    serve(() => current, {
      'instance/add': () => {
        current = view([inst(), B]);
        return ok(current);
      },
    });
    const w = await options();
    await openForm(w);
    await fill(w, {
      name: ' Atelier ',
      baseUrl: 'https://inventaire.example.org/',
      apiKey: 'hb_bbbbbbbb',
      passphrase: PASSPHRASE,
    });
    order = [];
    await submit(w);
    expect(order.slice(0, 2)).toEqual([
      'requestOrigin:https://inventaire.example.org',
      'send:instance/add',
    ]);
    expect(sent('instance/add')).toEqual([
      {
        type: 'instance/add',
        baseUrl: 'https://inventaire.example.org',
        apiKey: 'hb_bbbbbbbb',
        name: 'Atelier',
        passphrase: PASSPHRASE,
        newPassphrase: false,
      },
    ]);
    // Announced by name, the form closes and the list shows both instances.
    expect(w.get('.instances-announce').text()).toBe(tr('instances.added', ['Atelier']));
    expect(w.find('form.instance-form').exists()).toBe(false);
    expect(w.findAll('section[role="group"]')).toHaveLength(2);
  });

  it('(b) an address already configured: message naming the existing instance, no permission asked, nothing sent', async () => {
    serve(() => view([inst(), B]));
    const w = await options();
    await openForm(w);
    await fill(w, {
      baseUrl: 'https://INVENTAIRE.example.org:443/',
      apiKey: 'hb_cccccccc',
      passphrase: PASSPHRASE,
    });
    await submit(w);
    expect(w.text()).toContain(tr('instances.existing', ['Atelier']));
    expect(requestOrigin).not.toHaveBeenCalled();
    expect(sent('instance/add')).toHaveLength(0);
  });

  it.each([
    ['an invalid address', { baseUrl: 'pas une adresse' }, 'INVALID_URL'],
    ['public HTTP', { baseUrl: 'http://inventaire.example.org' }, 'INSECURE_URL'],
    ['a name longer than 50', { name: 'x'.repeat(51) }, 'INSTANCE_NAME_INVALID'],
    ['a name already taken (case ignored)', { name: 'MAISON' }, 'INSTANCE_NAME_TAKEN'],
    ['an empty key', { apiKey: '' }, 'UNAUTHORIZED'],
    ['a short passphrase', { passphrase: 'court' }, 'WEAK_PASSPHRASE'],
  ])(
    '(b) %s: refused locally, before any permission request or message',
    async (_n, over, code) => {
      serve(() => view([inst()]));
      const w = await options();
      await openForm(w);
      await fill(w, {
        name: '',
        baseUrl: 'https://inventaire.example.org',
        apiKey: 'hb_bbbbbbbb',
        passphrase: PASSPHRASE,
        ...over,
      });
      await submit(w);
      expect(w.get('form.instance-form [role="alert"]').text()).toContain(fr[`error.${code}`]!);
      expect(requestOrigin).not.toHaveBeenCalled();
      expect(sent('instance/add')).toHaveLength(0);
    },
  );

  it('(c) permission refused: nothing sent, the access message is shown (US2-4)', async () => {
    vi.mocked(requestOrigin).mockResolvedValue(false);
    serve(() => view([inst()]));
    const w = await options();
    await openForm(w);
    await fill(w, {
      baseUrl: 'https://inventaire.example.org',
      apiKey: 'hb_bbbbbbbb',
      passphrase: PASSPHRASE,
    });
    await submit(w);
    expect(requestOrigin).toHaveBeenCalledWith('https://inventaire.example.org');
    expect(sent('instance/add')).toHaveLength(0);
    expect(w.get('form.instance-form [role="alert"]').text()).toContain(
      fr['error.PERMISSION_DENIED']!,
    );
  });

  it('(c) a refusal from the service worker (wrong passphrase) keeps the form open with the error, named', async () => {
    serve(() => view([inst()]), { 'instance/add': fail('WRONG_PASSPHRASE') });
    const w = await options();
    await openForm(w);
    await fill(w, {
      name: 'Atelier',
      baseUrl: 'https://inventaire.example.org',
      apiKey: 'hb_bbbbbbbb',
      passphrase: 'mauvaise phrase 1',
    });
    await submit(w);
    expect(w.find('form.instance-form').exists()).toBe(true);
    expect(w.get('form.instance-form [role="alert"]').text()).toBe(
      tr('common.instanceError', ['Atelier', fr['error.WRONG_PASSPHRASE']!]),
    );
  });

  it('(c) connection test failed after saving: the form closes, the error is named with the default name (host)', async () => {
    let current = view([inst()]);
    serve(() => current, {
      'instance/add': () => {
        current = view([
          inst(),
          inst({
            id: 'x',
            name: 'inventaire.example.org',
            baseUrl: 'https://inventaire.example.org',
          }),
        ]);
        return fail('HOMEBOX_UNREACHABLE');
      },
    });
    const w = await options();
    await openForm(w);
    await fill(w, {
      baseUrl: 'https://inventaire.example.org',
      apiKey: 'hb_bbbbbbbb',
      passphrase: PASSPHRASE,
    });
    await submit(w);
    expect(w.find('form.instance-form').exists()).toBe(false);
    expect(w.text()).toContain(
      tr('common.instanceError', ['inventaire.example.org', fr['error.HOMEBOX_UNREACHABLE']!]),
    );
  });

  it('(d) 10 instances: the add button is disabled and described by the reason (US2-8)', async () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      inst({ id: `i${i}`, name: `n${i}`, baseUrl: `https://h${i}.example.com` }),
    );
    serve(() => view(ten));
    const w = await options();
    const add = addButton(w);
    expect(add.attributes('disabled')).toBeDefined();
    const describedBy = add.attributes('aria-describedby')!;
    expect(w.get(`#${describedBy}`).text()).toBe(tr('instances.limitReached', ['10']));
  });

  it('(d) under the limit: enabled, no aria-describedby', async () => {
    serve(() => view([inst()]));
    const w = await options();
    expect(addButton(w).attributes('disabled')).toBeUndefined();
    expect(addButton(w).attributes('aria-describedby')).toBeUndefined();
  });

  it.each([
    ['unlocked', false],
    ['locked', true],
  ])(
    '(e) %s: the current passphrase is asked at every add, without confirmation',
    async (_n, locked) => {
      serve(() => view([inst()], { locked }));
      const w = await options();
      const form = await openForm(w);
      expect(form.find('input[name="passphrase"]').exists()).toBe(true);
      expect(form.find('input[name="passphrase"]').attributes('required')).toBeDefined();
      expect(form.text()).toContain(fr['options.passphraseCurrent']);
      expect(form.find('input[name="confirmation"]').exists()).toBe(false);
    },
  );

  it('(e) legacy key without passphrase: a new passphrase with confirmation; a mismatch sends nothing', async () => {
    serve(() => view([inst({ keyState: 'ready' })], { needsPassphrase: true }));
    const w = await options();
    const form = await openForm(w);
    expect(form.text()).toContain(fr['options.passphraseNew']);
    await fill(w, {
      baseUrl: 'https://inventaire.example.org',
      apiKey: 'hb_bbbbbbbb',
      passphrase: PASSPHRASE,
      confirmation: 'autre phrase 123',
    });
    await submit(w);
    expect(w.text()).toContain(fr['options.mismatch']);
    expect(requestOrigin).not.toHaveBeenCalled();
    expect(sent('instance/add')).toHaveLength(0);
    await fill(w, { confirmation: PASSPHRASE });
    await submit(w);
    expect(sent('instance/add')[0]).toMatchObject({ newPassphrase: true });
  });

  it('(e) first installation: the add form chooses the passphrase (with confirmation) and sends newPassphrase: true', async () => {
    let current: ConfigView = { configured: false };
    serve(() => current, {
      'instance/add': () => {
        current = view([inst({ name: 'homebox.example.com' })]);
        return ok(current);
      },
    });
    const w = await options();
    expect(w.get('h1').text()).toBe(fr['options.title']);
    const form = w.get('form.instance-form');
    expect(form.text()).toContain(fr['options.passphraseNew']);
    await fill(w, {
      baseUrl: 'https://homebox.example.com',
      apiKey: 'hb_xxxxxxxx',
      passphrase: PASSPHRASE,
      confirmation: PASSPHRASE,
    });
    await submit(w);
    expect(order.filter((o) => o.startsWith('requestOrigin') || o === 'send:instance/add')).toEqual(
      ['requestOrigin:https://homebox.example.com', 'send:instance/add'],
    );
    expect(sent('instance/add')[0]).toMatchObject({ newPassphrase: true, name: '' });
    expect(w.text()).toContain(fr['options.savedAndConnected']);
  });
});

describe('options: a single instance looks as before (016, US2, T059 f)', () => {
  it('same fields as before (address, key, passphrase, « Tester et enregistrer »), plus « Ajouter une instance »', async () => {
    serve(() => view([inst()]));
    const w = await options();
    expect(w.get('h1').text()).toBe(fr['options.title']);
    expect(w.findAll('section[role="group"]')).toHaveLength(0);
    expect(w.find('#baseUrl').exists()).toBe(true);
    expect(w.find('#apiKey').exists()).toBe(true);
    expect(w.find('#passphrase').exists()).toBe(true);
    expect(button(w, fr['options.saveAndTest']!)).toBeDefined();
    expect(button(w, fr['options.deleteConfig']!)).toBeDefined();
    expect(addButton(w)).toBeDefined();
    // The optional name is in the add form.
    const form = await openForm(w);
    expect(form.text()).toContain(fr['instances.name']);
    expect(form.text()).toContain(fr['instances.nameHelp']);
    expect(form.get('input[name="name"]').attributes('maxlength')).toBe('50');
  });
});

describe('options: focus, text only, no log (016, US2, T059 g–i)', () => {
  it('(g) opening focuses the first field; closing (Escape or the add button) gives the focus back to the button', async () => {
    serve(() => view([inst()]));
    const w = await options();
    const form = await openForm(w);
    expect(addButton(w).attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(form.get('input[name="name"]').element);
    await form.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(w.find('form.instance-form').exists()).toBe(false);
    expect(document.activeElement).toBe(addButton(w).element);
    expect(addButton(w).attributes('aria-expanded')).toBe('false');
  });

  it('(h) instance names are rendered as text, never as HTML', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    serve(() => view([inst({ name: evil }), B]));
    const w = await options();
    expect(w.find('img[src="x"]').exists()).toBe(false);
    expect(w.findAll('section[role="group"]')[0]!.get('h2').text()).toBe(evil);
  });

  it('(i) nothing is written to the console while adding', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    serve(() => view([inst()]), { 'instance/add': fail('WRONG_PASSPHRASE') });
    const w = await options();
    await openForm(w);
    await fill(w, {
      name: 'Atelier',
      baseUrl: 'https://inventaire.example.org',
      apiKey: 'hb_bbbbbbbb',
      passphrase: PASSPHRASE,
    });
    await submit(w);
    expect(spies.flatMap((s) => s.mock.calls)).toEqual([]);
  });
});

describe('options: InstancesCard alone, in English (016, US2, T059/T060)', () => {
  it('renders the add button and the limit text from the English catalog', async () => {
    setTestLanguage('en');
    const en = loadCatalog('en');
    const ten = Array.from({ length: 10 }, (_, i) =>
      inst({ id: `i${i}`, name: `n${i}`, baseUrl: `https://h${i}.example.com` }),
    );
    const w = mount(InstancesCard, { props: { view: view(ten) } });
    await flushPromises();
    expect(w.text()).toContain(en['instances.add']);
    expect(w.text()).toContain(makeGetMessage(en)('instances.limitReached', ['10']));
    expect(w.findAll('section[role="group"]')[0]!.attributes('aria-label')).toBe(
      makeGetMessage(en)('instances.cardAria', ['n0']),
    );
  });
});

describe('options: managing the instances (016, US4, T081)', () => {
  const card = (w: VueWrapper, name: string) =>
    w.findAll('section[role="group"]').find((c) => c.get('h2').text() === name)!;
  const inCard = (w: VueWrapper, name: string, text: string) =>
    card(w, name).findAll('button').find((b) => b.text() === text);

  it('(a) « Renommer »: inline field + « Enregistrer le nom », instance/rename without passphrase', async () => {
    let current = view([inst(), B]);
    serve(() => current, {
      'instance/rename': (m: MessageOf<MessageType>) => {
        current = view([inst(), { ...B, name: (m as { name: string }).name }]);
        return ok(current);
      },
    });
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.rename']!)!.trigger('click');
    const field = card(w, 'Atelier').get('form.rename input');
    expect((field.element as HTMLInputElement).value).toBe('Atelier');
    expect(field.attributes('maxlength')).toBe('50');
    expect(document.activeElement).toBe(field.element);
    await field.setValue('Garage');
    await inCard(w, 'Atelier', fr['instances.saveName']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/rename')).toEqual([{ type: 'instance/rename', instanceId: 'inst-b', name: 'Garage' }]);
    expect(JSON.stringify(sent('instance/rename'))).not.toMatch(/passphrase/);
    expect(card(w, 'Garage')).toBeDefined();
  });

  it('(a) a refused name: the error is shown on the card, prefixed with the instance name', async () => {
    serve(() => view([inst(), B]), { 'instance/rename': fail('INSTANCE_NAME_TAKEN') });
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.rename']!)!.trigger('click');
    await card(w, 'Atelier').get('form.rename input').setValue('maison');
    await card(w, 'Atelier').get('form.rename').trigger('submit');
    await flushPromises();
    expect(card(w, 'Atelier').get('[role="alert"]').text()).toBe(
      tr('common.instanceError', ['Atelier', fr['error.INSTANCE_NAME_TAKEN']!]),
    );
  });

  it('(b) « Tester la connexion » sends instance/test with the id of the card; only while unlocked', async () => {
    serve(() => view([inst(), B]), { 'instance/test': ok(view([inst(), B])) });
    const w = await options();
    await inCard(w, 'Atelier', fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/test')).toEqual([{ type: 'instance/test', instanceId: 'inst-b' }]);
    serve(() => view([inst(), B], { locked: true }));
    const locked = await options();
    expect(inCard(locked, 'Atelier', fr['options.test']!)).toBeUndefined();
  });

  it('(c) « Modifier l’adresse ou la clé »: the form in edit mode; requestOrigin only for a new origin, then instance/update', async () => {
    serve(() => view([inst(), B]), { 'instance/update': ok(view([inst(), B])) });
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.edit']!)!.trigger('click');
    const form = card(w, 'Atelier').get('form.instance-edit-form');
    expect((form.get('input[name="baseUrl"]').element as HTMLInputElement).value).toBe('https://inventaire.example.org');
    expect(form.get('input[name="apiKey"]').attributes('placeholder')).toBe('hb_••••bbbb');
    expect(form.find('input[name="confirmation"]').exists()).toBe(false);
    await form.get('input[name="passphrase"]').setValue(PASSPHRASE);
    order = [];
    await form.trigger('submit');
    await flushPromises();
    // Same origin: no permission request.
    expect(order.filter((o) => o.startsWith('requestOrigin'))).toEqual([]);
    expect(sent('instance/update')).toEqual([
      { type: 'instance/update', instanceId: 'inst-b', baseUrl: 'https://inventaire.example.org', apiKey: '', passphrase: PASSPHRASE, newPassphrase: false },
    ]);

    await inCard(w, 'Atelier', fr['instances.edit']!)!.trigger('click');
    const again = card(w, 'Atelier').get('form.instance-edit-form');
    await again.get('input[name="baseUrl"]').setValue('https://autre.example.net');
    await again.get('input[name="apiKey"]').setValue('hb_dddddddd');
    await again.get('input[name="passphrase"]').setValue(PASSPHRASE);
    order = [];
    await again.trigger('submit');
    await flushPromises();
    expect(order.slice(0, 2)).toEqual(['requestOrigin:https://autre.example.net', 'send:instance/update']);
    // With several instances, a new key keeps the current passphrase.
    expect(sent('instance/update')[1]).toMatchObject({ apiKey: 'hb_dddddddd', newPassphrase: false });
  });

  it('(c) the address of another instance: named, no permission asked, nothing sent', async () => {
    serve(() => view([inst(), B]));
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.edit']!)!.trigger('click');
    const form = card(w, 'Atelier').get('form.instance-edit-form');
    await form.get('input[name="baseUrl"]').setValue('https://homebox.example.com/');
    await form.get('input[name="passphrase"]').setValue(PASSPHRASE);
    await form.trigger('submit');
    await flushPromises();
    expect(card(w, 'Atelier').text()).toContain(tr('instances.existing', ['Maison']));
    expect(requestOrigin).not.toHaveBeenCalled();
    expect(sent('instance/update')).toHaveLength(0);
  });

  it('(d) « Supprimer cette instance »: the confirmation names it; refused → nothing sent', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    serve(() => view([inst(), B]));
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.delete']!)!.trigger('click');
    expect(confirm).toHaveBeenCalledWith(tr('instances.confirmDelete', ['Atelier']));
    expect(sent('instance/delete')).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('(d) confirmed: instance/delete, announced by name in a status region, the history is reloaded', async () => {
    vi.stubGlobal('confirm', () => true);
    let current = view([inst(), B]);
    serve(() => current, {
      'instance/delete': () => {
        current = view([inst()]);
        return ok(current);
      },
    });
    const w = await options();
    const before = sent('history/list').length;
    await inCard(w, 'Atelier', fr['instances.delete']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/delete')).toEqual([{ type: 'instance/delete', instanceId: 'inst-b' }]);
    const status = w.get('.instances-announce');
    expect(status.element.tagName).toBe('OUTPUT');
    expect(status.text()).toBe(tr('instances.deleted', ['Atelier']));
    expect(sent('history/list').length).toBe(before + 1);
    vi.unstubAllGlobals();
  });

  it('(d) INSTANCE_BUSY is shown on the card, named', async () => {
    vi.stubGlobal('confirm', () => true);
    serve(() => view([inst(), B]), { 'instance/delete': fail('INSTANCE_BUSY') });
    const w = await options();
    await inCard(w, 'Atelier', fr['instances.delete']!)!.trigger('click');
    await flushPromises();
    expect(card(w, 'Atelier').get('[role="alert"]').text()).toBe(
      tr('common.instanceError', ['Atelier', fr['error.INSTANCE_BUSY']!]),
    );
    vi.unstubAllGlobals();
  });

  it('(e) two instances: global « Supprimer toute la configuration » with its own confirmation; one instance: unchanged', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    serve(() => view([inst(), B]));
    const w = await options();
    expect(button(w, fr['options.deleteConfig']!)).toBeUndefined();
    await button(w, fr['options.deleteAll']!)!.trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenLastCalledWith(fr['options.confirmDeleteAll']);
    expect(sent('config/delete')).toHaveLength(1);

    serve(() => view([inst()]));
    const one = await options();
    expect(button(one, fr['options.deleteAll']!)).toBeUndefined();
    await button(one, fr['options.deleteConfig']!)!.trigger('click');
    expect(confirm).toHaveBeenLastCalledWith(fr['options.confirmDelete']);
    vi.unstubAllGlobals();
  });

  it.each(['unreadable', 'missing'] as const)('(f) keyState %s: « Clé à ressaisir » in a status region of the card', async (keyState) => {
    serve(() => view([inst(), { ...B, keyState }]));
    const w = await options();
    const status = card(w, 'Atelier').get('.key-state');
    expect(status.attributes('role')).toBe('status');
    expect(status.text()).toBe(fr['instances.keyUnreadable']);
    expect(card(w, 'Maison').find('.key-state').exists()).toBe(false);
  });

  it('(g) PERMISSION_DENIED from a test: « Redemander l’accès » asks for the origin of this instance in the click', async () => {
    serve(() => view([inst(), B]), { 'instance/test': fail('PERMISSION_DENIED') });
    const w = await options();
    await inCard(w, 'Atelier', fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(requestOrigin).not.toHaveBeenCalled();
    await inCard(w, 'Atelier', fr['instances.requestAccess']!)!.trigger('click');
    await flushPromises();
    expect(requestOrigin).toHaveBeenCalledWith('https://inventaire.example.org');
  });

  it('(c) a single instance: the former form is the edit form (instance/update), with the name; a name alone is a rename', async () => {
    let current = view([inst()]);
    serve(() => current, {
      'instance/update': ok(view([inst()])),
      'instance/rename': () => {
        current = view([inst({ name: 'Chalet' })]);
        return ok(current);
      },
    });
    const w = await options();
    expect((w.get('#instanceName').element as HTMLInputElement).value).toBe('Maison');
    await w.get('#passphrase').setValue(PASSPHRASE);
    await w.findAll('form').find((f) => f.find('#baseUrl').exists())!.trigger('submit');
    await flushPromises();
    expect(sent('instance/update')).toEqual([
      { type: 'instance/update', instanceId: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: '', passphrase: PASSPHRASE, newPassphrase: false },
    ]);
    expect(w.text()).toContain(fr['options.savedAndConnected']);

    // A name alone: no passphrase required, instance/rename only.
    await w.get('#instanceName').setValue('Chalet');
    expect(w.get('#passphrase').attributes('required')).toBeUndefined();
    await w.findAll('form').find((f) => f.find('#baseUrl').exists())!.trigger('submit');
    await flushPromises();
    expect(sent('instance/rename')).toEqual([{ type: 'instance/rename', instanceId: 'inst-a', name: 'Chalet' }]);
    expect(sent('instance/update')).toHaveLength(1);
  });

  it('(c) a single instance, new key typed: a new passphrase with confirmation (as before), newPassphrase: true', async () => {
    serve(() => view([inst()]), { 'instance/update': ok(view([inst()])) });
    const w = await options();
    await w.get('#apiKey').setValue('hb_dddddddd');
    expect(w.text()).toContain(fr['options.passphraseNew']);
    await w.get('#passphrase').setValue(PASSPHRASE);
    await w.get('#confirmation').setValue(PASSPHRASE);
    await w.findAll('form').find((f) => f.find('#baseUrl').exists())!.trigger('submit');
    await flushPromises();
    expect(sent('instance/update')[0]).toMatchObject({ apiKey: 'hb_dddddddd', newPassphrase: true });
  });

  it('(b) a single instance: the test button of the session sends instance/test for it', async () => {
    serve(() => view([inst()]), { 'instance/test': ok(view([inst()])) });
    const w = await options();
    await button(w, fr['options.test']!)!.trigger('click');
    await flushPromises();
    expect(sent('instance/test')).toEqual([{ type: 'instance/test', instanceId: 'inst-a' }]);
    expect(w.text()).toContain(fr['options.connected']);
  });
});

describe('options: changing the passphrase (016, US5, T089)', () => {
  const open = async (w: VueWrapper) => {
    await button(w, fr['passphrase.changeTitle']!)!.trigger('click');
    await flushPromises();
    return w.get('form.passphrase-form');
  };
  const fillPass = async (form: ReturnType<VueWrapper['get']>, current: string, next: string, confirm: string) => {
    await form.get('input[name="current"]').setValue(current);
    await form.get('input[name="next"]').setValue(next);
    await form.get('input[name="confirm"]').setValue(confirm);
  };

  it('three fields, session/change-passphrase, « Phrase de passe changée… » in a status region', async () => {
    serve(() => view([inst(), B]), { 'session/change-passphrase': ok({ view: view([inst(), B]), reenter: [] }) });
    const w = await options();
    const form = await open(w);
    expect(form.text()).toContain(fr['passphrase.current']);
    expect(form.text()).toContain(fr['passphrase.next']);
    expect(form.text()).toContain(fr['passphrase.confirm']);
    expect(document.activeElement).toBe(form.get('input[name="current"]').element);
    await fillPass(form, PASSPHRASE, 'nouvelle phrase 456', 'nouvelle phrase 456');
    await form.trigger('submit');
    await flushPromises();
    expect(sent('session/change-passphrase')).toEqual([
      { type: 'session/change-passphrase', current: PASSPHRASE, next: 'nouvelle phrase 456' },
    ]);
    expect(w.get('.passphrase-status').attributes('role')).toBe('status');
    expect(w.get('.passphrase-status').text()).toBe(fr['passphrase.changed']);
  });

  it('a different confirmation is refused without sending', async () => {
    serve(() => view([inst()]));
    const w = await options();
    const form = await open(w);
    await fillPass(form, PASSPHRASE, 'nouvelle phrase 456', 'autre phrase 789');
    await form.trigger('submit');
    await flushPromises();
    expect(form.text()).toContain(fr['options.mismatch']);
    expect(sent('session/change-passphrase')).toHaveLength(0);
  });

  it('wrong current passphrase: the error is shown', async () => {
    serve(() => view([inst()]), { 'session/change-passphrase': fail('WRONG_PASSPHRASE') });
    const w = await options();
    const form = await open(w);
    await fillPass(form, 'mauvaise phrase 1', 'nouvelle phrase 456', 'nouvelle phrase 456');
    await form.trigger('submit');
    await flushPromises();
    expect(form.get('[role="alert"]').text()).toBe(fr['error.WRONG_PASSPHRASE']);
  });

  it('keys to re-enter: « instances.reenterAfterChange » lists their NAMES', async () => {
    const after = view([inst(), { ...B, keyState: 'missing' }]);
    serve(() => after, { 'session/change-passphrase': ok({ view: after, reenter: ['inst-b'] }) });
    const w = await options();
    const form = await open(w);
    await fillPass(form, PASSPHRASE, 'nouvelle phrase 456', 'nouvelle phrase 456');
    await form.trigger('submit');
    await flushPromises();
    expect(w.get('.passphrase-status').text()).toBe(tr('instances.reenterAfterChange', ['Atelier']));
  });

  it('not offered for a legacy key without passphrase', async () => {
    serve(() => view([inst()], { needsPassphrase: true }));
    const w = await options();
    expect(button(w, fr['passphrase.changeTitle']!)).toBeUndefined();
  });
});
