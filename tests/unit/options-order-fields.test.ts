import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import OptionsApp from '@/ui/options/App.vue';
import InstancesCard from '@/ui/options/InstancesCard.vue';
import OrderFieldsSettings from '@/ui/options/OrderFieldsSettings.vue';
import { loadCatalog } from './i18n-harness';

/** Order-fields setting per instance in the settings (spec 019, Q-U4, contracts/ui.md §1). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };
const DEFAULT = { enabled: false, names: NAMES };
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
const configView = (instances: InstanceView[]): ConfigView => ({
  configured: true,
  locked: false,
  needsPassphrase: false,
  instances,
  defaultInstanceId: instances[0]!.id,
  maxInstances: 10,
});

type Replies = Partial<Record<string, unknown | ((msg: Record<string, unknown>) => unknown)>>;
/** Stored settings by instance: `order-fields/set` writes here, `order-fields/get` reads here. */
let stored: Record<string, unknown> = {};
function serve(replies: Replies = {}, cfg: ConfigView = configView([inst()])) {
  vi.mocked(send).mockImplementation(((msg: Record<string, unknown>) => {
    const r = replies[msg.type as string];
    if (r !== undefined)
      return Promise.resolve(
        typeof r === 'function' ? (r as (m: Record<string, unknown>) => unknown)(msg) : r,
      );
    switch (msg.type) {
      case 'order-fields/get':
        return Promise.resolve(ok({ settings: stored[msg.instanceId as string] ?? DEFAULT }));
      case 'order-fields/set':
        stored[msg.instanceId as string] = msg.settings;
        return Promise.resolve(ok({ settings: msg.settings }));
      case 'order-fields/names':
        return Promise.resolve(
          ok({ names: ['Boutique', 'Couleur', 'N° commande', 'Order number'] }),
        );
      case 'config/get':
      case 'session/open':
        return Promise.resolve(cfg);
      case 'session/get-policy':
        return Promise.resolve({ v: 1, policy: 'browser-close' });
      case 'history/list':
        return Promise.resolve(ok({ state: 'locked', enabled: true, entries: [] }));
      case 'template/get-default':
        return Promise.resolve(ok({ defaultTemplate: null }));
      default:
        return Promise.resolve(ok(undefined));
    }
  }) as never);
}
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m as unknown as Record<string, unknown>)
    .filter((m) => m.type === type);
const mountField = async (locked = false, instance = inst()) => {
  const w = mount(OrderFieldsSettings, { props: { instance, locked }, attachTo: document.body });
  await flushPromises();
  return w;
};
const checkbox = (w: VueWrapper) => w.get('input[type="checkbox"]');
const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text() === text);
const save = async (w: VueWrapper) => {
  await button(w, fr['orderFields.save']!)!.trigger('click');
  await flushPromises();
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
  stored = {};
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('OrderFieldsSettings: option (US1-1, FR-001, SC-005)', () => {
  it('order-fields/get on mount; default: unchecked, with the explanation tied by aria-describedby', async () => {
    serve();
    const w = await mountField();
    expect(sent('order-fields/get')).toEqual([{ type: 'order-fields/get', instanceId: 'inst-a' }]);
    const box = checkbox(w);
    expect((box.element as HTMLInputElement).checked).toBe(false);
    const label = w.get(`label[for="${box.attributes('id')}"]`);
    expect(label.text()).toBe(fr['orderFields.optionLabel']);
    const help = w.get(`#${CSS.escape(box.attributes('aria-describedby')!)}`);
    expect(help.text()).toBe(fr['orderFields.optionHelp']);
  });

  it('read failure: the default is shown with an ErrorBanner of the code received', async () => {
    serve({ 'order-fields/get': fail('INSTANCE_NOT_FOUND') });
    const w = await mountField();
    expect((checkbox(w).element as HTMLInputElement).checked).toBe(false);
    expect(w.text()).toContain(fr['error.INSTANCE_NOT_FOUND']);
  });

  it('check + « Enregistrer » = 2 interactions: order-fields/set with the default names, « Réglage enregistré. » announced', async () => {
    serve();
    const w = await mountField();
    await checkbox(w).setValue(true);
    await save(w);
    expect(sent('order-fields/set')).toEqual([
      { type: 'order-fields/set', instanceId: 'inst-a', settings: { enabled: true, names: NAMES } },
    ]);
    // A status message is an <output> (implicit role status, SonarCloud rule of the project).
    expect(w.get('output.announce').text()).toBe(fr['orderFields.saved']);
  });

  it('uncheck + « Enregistrer »: enabled false with the names unchanged', async () => {
    stored['inst-a'] = {
      enabled: true,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    };
    serve();
    const w = await mountField();
    expect((checkbox(w).element as HTMLInputElement).checked).toBe(true);
    await checkbox(w).setValue(false);
    await save(w);
    expect(sent('order-fields/set')[0]!.settings).toEqual({
      enabled: false,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    });
  });

  it('locked: the box and the button stay usable (FR-007)', async () => {
    serve();
    const w = await mountField(true);
    expect(checkbox(w).attributes('disabled')).toBeUndefined();
    expect(button(w, fr['orderFields.save']!)!.attributes('disabled')).toBeUndefined();
    await checkbox(w).setValue(true);
    await save(w);
    expect(sent('order-fields/set')).toHaveLength(1);
  });

  it('a save failure is shown with its code', async () => {
    serve({ 'order-fields/set': fail('INSTANCE_NOT_FOUND') });
    const w = await mountField();
    await checkbox(w).setValue(true);
    await save(w);
    expect(w.text()).toContain(fr['error.INSTANCE_NOT_FOUND']);
    expect(w.text()).not.toContain(fr['orderFields.saved']);
  });
});

describe('OrderFieldsSettings mounted per instance', () => {
  it('one component per instance card, each with its own instance', async () => {
    serve();
    const w = mount(InstancesCard, {
      props: { view: configView([inst(), B]) },
      attachTo: document.body,
    });
    await flushPromises();
    const fields = w.findAllComponents(OrderFieldsSettings);
    expect(fields.map((f) => f.props('instance').id)).toEqual(['inst-a', 'inst-b']);
    expect(sent('order-fields/get').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
  });

  it('the single instance: mounted in the options page', async () => {
    serve();
    const w = mount(OptionsApp, { attachTo: document.body });
    await flushPromises();
    const fields = w.findAllComponents(OrderFieldsSettings);
    expect(fields.map((f) => f.props('instance').id)).toEqual(['inst-a']);
    expect(fields[0]!.props('locked')).toBe(false);
  });
});

describe('OrderFieldsSettings: names and suggestions (US3)', () => {
  const nameInput = (w: VueWrapper, key: string) => {
    const label = w.findAll('label').find((l) => l.text() === fr[key]);
    if (!label) throw new Error(`no label ${key}`);
    return w.get(`#${CSS.escape(label.attributes('for')!)}`);
  };
  const NUMBER_KEY = 'orderFields.nameOrderNumber';
  const MERCHANT_KEY = 'orderFields.nameMerchant';
  const URL_KEY = 'orderFields.nameOrderUrl';
  const valueOf = (w: VueWrapper, key: string) =>
    (nameInput(w, key).element as HTMLInputElement).value;
  async function enabledField(locked = false) {
    stored['inst-a'] = { enabled: true, names: NAMES };
    serve();
    return mountField(locked);
  }

  it('the box checked shows three labelled inputs, prefilled with the default names (US3-1)', async () => {
    serve();
    const w = await mountField();
    expect(w.findAll('label').some((l) => l.text() === fr[NUMBER_KEY])).toBe(false);
    await checkbox(w).setValue(true);
    expect([valueOf(w, NUMBER_KEY), valueOf(w, MERCHANT_KEY), valueOf(w, URL_KEY)]).toEqual([
      'Order number',
      'Merchant',
      'Order URL',
    ]);
  });

  it('unlocked: the first focus sends ONE order-fields/names for the three inputs; suggestions filtered (US3-2)', async () => {
    const w = await enabledField();
    await nameInput(w, NUMBER_KEY).trigger('focus');
    await flushPromises();
    await nameInput(w, MERCHANT_KEY).trigger('focus');
    await flushPromises();
    expect(sent('order-fields/names')).toEqual([
      { type: 'order-fields/names', instanceId: 'inst-a' },
    ]);
    await nameInput(w, NUMBER_KEY).trigger('blur');
    await nameInput(w, MERCHANT_KEY).setValue('bout');
    const merchantBox = w.findAll('.field-name-combobox')[1]!;
    expect(merchantBox.findAll('[role="option"]').map((o) => o.text())).toEqual(['Boutique']);
  });

  it('type « N° », choose « N° commande », save: at most 3 interactions; set with this name (SC-005, US3-7)', async () => {
    const w = await enabledField();
    const input = nameInput(w, NUMBER_KEY);
    await input.trigger('focus');
    await flushPromises();
    await input.setValue('N°');
    await w
      .findAll('[role="option"]')
      .find((o) => o.text() === 'N° commande')!
      .trigger('mousedown');
    await save(w);
    expect(sent('order-fields/set')).toEqual([
      {
        type: 'order-fields/set',
        instanceId: 'inst-a',
        settings: { enabled: true, names: { ...NAMES, orderNumber: 'N° commande' } },
      },
    ]);
    expect(valueOf(w, NUMBER_KEY)).toBe('N° commande');
  });

  it('locked: option and names editable, « unlock » sentence, no order-fields/names (US3-3, FR-007)', async () => {
    const w = await enabledField(true);
    expect(w.text()).toContain(fr['orderFields.unlockForSuggestions']);
    await nameInput(w, NUMBER_KEY).trigger('focus');
    await flushPromises();
    expect(sent('order-fields/names')).toEqual([]);
    await nameInput(w, NUMBER_KEY).setValue('Numéro');
    await save(w);
    expect(sent('order-fields/set')[0]!.settings).toEqual({
      enabled: true,
      names: { ...NAMES, orderNumber: 'Numéro' },
    });
  });

  it.each(['FIELD_NAMES_UNAVAILABLE', 'HOMEBOX_UNREACHABLE'] as const)(
    'names failure (%s): distinct message and « Réessayer »; free entry and save still possible (US3-4, FR-006)',
    async (code) => {
      stored['inst-a'] = { enabled: true, names: NAMES };
      serve({ 'order-fields/names': fail(code) });
      const w = await mountField();
      await nameInput(w, NUMBER_KEY).trigger('focus');
      await flushPromises();
      expect(w.text()).toContain(fr[`error.${code}`]);
      const retry = button(w, fr['orderFields.retry']!)!;
      expect(retry).toBeDefined();
      await retry.trigger('click');
      await flushPromises();
      expect(sent('order-fields/names')).toHaveLength(2);
      await nameInput(w, NUMBER_KEY).setValue('Numéro');
      await save(w);
      expect(sent('order-fields/set')).toHaveLength(1);
    },
  );

  it.each([
    ['empty', MERCHANT_KEY, '  ', 'orderFields.errors.empty'],
    ['256 bytes', MERCHANT_KEY, 'é'.repeat(128), 'orderFields.errors.tooLong'],
    ['duplicate (case ignored)', URL_KEY, 'merchant', 'orderFields.errors.duplicate'],
    ['with =', MERCHANT_KEY, 'a=b', 'orderFields.errors.forbiddenChar'],
    ['with a control character', MERCHANT_KEY, 'a\u0001b', 'orderFields.errors.forbiddenChar'],
  ])(
    'save refused, name %s: message next to the input, focus on it, nothing sent (US3-5)',
    async (_label, key, value, message) => {
      const w = await enabledField();
      const input = nameInput(w, key);
      await input.setValue(value);
      await save(w);
      expect(sent('order-fields/set')).toEqual([]);
      expect(input.attributes('aria-invalid')).toBe('true');
      const described = input
        .attributes('aria-describedby')!
        .split(' ')
        .map((id) => w.find(`#${CSS.escape(id)}`).text());
      expect(described).toContain(fr[message]);
      // Focus on the first input in error (a duplicate flags both names: the first one of the two).
      expect(document.activeElement).toBe(w.find('input[aria-invalid="true"]').element);
      expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
    },
  );

  it('names sent trimmed', async () => {
    const w = await enabledField();
    await nameInput(w, MERCHANT_KEY).setValue('  Boutique  ');
    await save(w);
    expect(sent('order-fields/set')[0]!.settings).toEqual({
      enabled: true,
      names: { ...NAMES, merchant: 'Boutique' },
    });
  });

  it('case warning at blur: « Utiliser « Order number » » replaces the input; non blocking (US3-6, FR-005)', async () => {
    const w = await enabledField();
    const input = nameInput(w, NUMBER_KEY);
    await input.trigger('focus');
    await flushPromises();
    await input.setValue('order number');
    await input.trigger('blur');
    const warning = w
      .findAll('output')
      .find((o) => o.text().includes(fr['orderFields.caseWarning']!.replace('$1', 'Order number')));
    expect(warning).toBeDefined();
    await button(w, fr['orderFields.useExisting']!.replace('$1', 'Order number'))!.trigger('click');
    expect(valueOf(w, NUMBER_KEY)).toBe('Order number');
    expect(w.text()).not.toContain(fr['orderFields.caseWarning']!.replace('$1', 'Order number'));
  });

  it('the case warning does not block the save', async () => {
    const w = await enabledField();
    const input = nameInput(w, NUMBER_KEY);
    await input.trigger('focus');
    await flushPromises();
    await input.setValue('order number');
    await input.trigger('blur');
    await save(w);
    expect(sent('order-fields/set')[0]!.settings).toEqual({
      enabled: true,
      names: { ...NAMES, orderNumber: 'order number' },
    });
  });

  it('saved names are shown when read again (US3-7)', async () => {
    stored['inst-a'] = {
      enabled: true,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    };
    serve();
    const w = await mountField();
    expect([valueOf(w, NUMBER_KEY), valueOf(w, MERCHANT_KEY), valueOf(w, URL_KEY)]).toEqual([
      'N° commande',
      'Boutique',
      'Lien',
    ]);
  });

  it('« Rétablir les noms par défaut » puts the defaults back, saved at the next « Enregistrer » (US3-8)', async () => {
    stored['inst-a'] = {
      enabled: true,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    };
    serve();
    const w = await mountField();
    await button(w, fr['orderFields.resetNames']!)!.trigger('click');
    expect([valueOf(w, NUMBER_KEY), valueOf(w, MERCHANT_KEY), valueOf(w, URL_KEY)]).toEqual([
      'Order number',
      'Merchant',
      'Order URL',
    ]);
    expect(sent('order-fields/set')).toEqual([]);
    await save(w);
    expect(sent('order-fields/set')[0]!.settings).toEqual({ enabled: true, names: NAMES });
  });

  it('suggestions are never stored, and forgotten when locked (FR-034)', async () => {
    const w = await enabledField();
    await nameInput(w, NUMBER_KEY).trigger('focus');
    await flushPromises();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
    await w.setProps({ locked: true });
    await nameInput(w, MERCHANT_KEY).setValue('bout');
    expect(w.findAll('[role="option"]')).toHaveLength(0);
    await w.setProps({ locked: false });
    await nameInput(w, MERCHANT_KEY).trigger('focus');
    await flushPromises();
    expect(sent('order-fields/names')).toHaveLength(2);
  });
});

describe('OrderFieldsSettings: several instances (US5)', () => {
  it('each card reads, writes and asks the suggestions with its own instance (US5-2)', async () => {
    stored['inst-a'] = { enabled: true, names: NAMES };
    stored['inst-b'] = {
      enabled: true,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    };
    serve({}, configView([inst(), B]));
    const w = mount(InstancesCard, {
      props: { view: configView([inst(), B]) },
      attachTo: document.body,
    });
    await flushPromises();
    const fields = w.findAllComponents(OrderFieldsSettings);
    const second = fields[1]!;
    const label = second.findAll('label').find((l) => l.text() === fr['orderFields.nameMerchant'])!;
    expect(
      (second.get(`#${CSS.escape(label.attributes('for')!)}`).element as HTMLInputElement).value,
    ).toBe('Boutique');
    await second.get(`#${CSS.escape(label.attributes('for')!)}`).trigger('focus');
    await flushPromises();
    expect(sent('order-fields/names')).toEqual([
      { type: 'order-fields/names', instanceId: 'inst-b' },
    ]);
    await second
      .findAll('button')
      .find((b) => b.text() === fr['orderFields.save'])!
      .trigger('click');
    await flushPromises();
    expect(sent('order-fields/set').map((m) => m.instanceId)).toEqual(['inst-b']);
  });

  it('an instance removed: its component disappears with its card', async () => {
    serve();
    const w = mount(InstancesCard, {
      props: { view: configView([inst(), B]) },
      attachTo: document.body,
    });
    await flushPromises();
    await w.setProps({ view: configView([inst()]) });
    await flushPromises();
    expect(
      w.findAllComponents(OrderFieldsSettings).map((f) => f.props('instance').id),
    ).not.toContain('inst-b');
  });
});
