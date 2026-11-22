import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  TemplateDetail,
  TemplateOption,
} from '@/shared/types';
import TemplatePicker from '@/ui/components/TemplatePicker.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog } from './i18n-harness';

/** Order fields in the summary (spec 019, Q-U4, contracts/ui.md §2). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const fmt = (key: string, ...subs: string[]) =>
  subs.reduce((s, v, i) => s.replace(`$${i + 1}`, v), fr[key]!);
const NUMBER = '000-0000000-0000000';
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };
const ON = { enabled: true, names: NAMES };
const OFF = { enabled: false, names: NAMES };

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
  unitPrice: found(49.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: ORDER_URL,
  orderNumber: found(NUMBER),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    { id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-000.pdf', size: 2048 },
  ],
});
const CLAVIER = product('a', 'Clavier sans fil Exemple Pro');
const SOURIS = product('b', 'Souris Exemple');

const LIVRE: TemplateDetail = {
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: 'a'.repeat(64),
  description: '',
  quantity: null,
  insured: false,
  manufacturer: '',
  modelNumber: '',
  lifetimeWarranty: false,
  warrantyDetails: '',
  locationId: 'loc-1',
  tags: [],
  fields: [
    {
      type: 'text',
      kind: 'text',
      name: 'Order number',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
    {
      type: 'text',
      kind: 'text',
      name: 'Auteur',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
  ],
};
const OPTIONS: TemplateOption[] = [
  { id: 'tpl-1', name: 'Livre', description: '' },
  { id: 'tpl-2', name: 'Jeu', description: '' },
];

type Reply = unknown | ((instanceId: string) => unknown);
interface Replies {
  order?: Reply;
  details?: Record<string, TemplateDetail>;
}
const resolveReply = (r: Reply, instanceId: string) =>
  typeof r === 'function' ? (r as (id: string) => unknown)(instanceId) : r;

async function mountSummary(
  products: DetectedProduct[] | null,
  replies: Replies = {},
  cfg = config(),
) {
  vi.mocked(send).mockImplementation(((msg: {
    type: string;
    instanceId?: string;
    templateId?: string;
    refs?: { id: string }[];
  }) => {
    switch (msg.type) {
      case 'detect/run':
        return Promise.resolve(
          products ? ok({ purchase: purchase(products), warnings: [] }) : fail('NOT_AN_ORDER_PAGE'),
        );
      case 'duplicate/check':
        return Promise.resolve(
          ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }),
        );
      case 'tag/list':
        return Promise.resolve(ok({ tags: [] }));
      case 'location/list':
        return Promise.resolve(
          ok({
            locations: [{ id: 'loc-1', name: 'Bureau', path: ['Maison', 'Bureau'] }],
            lastUsedId: null,
          }),
        );
      case 'template/list':
        return Promise.resolve(
          ok({ templates: OPTIONS, defaultTemplate: null, defaultState: 'none' }),
        );
      case 'template/get': {
        const d =
          replies.details?.[msg.templateId!] ??
          (msg.templateId === 'tpl-2'
            ? { ...LIVRE, id: 'tpl-2', name: 'Jeu', fingerprint: 'b'.repeat(64), fields: [] }
            : LIVRE);
        return Promise.resolve(ok({ template: d }));
      }
      case 'template/check':
        return Promise.resolve(
          ok({ results: msg.refs!.map((r) => ({ id: r.id, state: 'same' })) }),
        );
      case 'order-fields/get': {
        const r = resolveReply(replies.order ?? ok({ settings: ON }), msg.instanceId!);
        return r instanceof Promise ? r : Promise.resolve(r);
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

const sections = (w: Mounted) => w.findAll('fieldset.order-fields');
const inputFor = (scope: Mounted | DOMWrapper<Element>, label: string) => {
  const l = scope.findAll('label').find((x) => x.text() === label);
  if (!l) throw new Error(`no label ${label}`);
  return scope.get(`#${CSS.escape(l.attributes('for')!)}`);
};
const orderNumberInput = (w: Mounted, i = 0) =>
  w.findAll('input').filter((x) => x.attributes('id')?.endsWith('-order'))[i]!;
const addButton = (w: Mounted) => w.get('.footer button.primary');
const confirm = async (w: Mounted) => {
  await addButton(w).trigger('click');
  await flushPromises();
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const sentTypes = () => vi.mocked(send).mock.calls.map((c) => (c[0] as { type: string }).type);
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map((c) => c[0] as { type: string } & Record<string, unknown>)
    .filter((m) => m.type === type);
const ALL = [
  { role: 'orderNumber', name: 'Order number', value: NUMBER },
  { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
  { role: 'orderUrl', name: 'Order URL', value: ORDER_URL },
];

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('US1: order fields section of the summary (option on)', () => {
  it('order-fields/get with the target instance; one fieldset « Champs de commande » per product with name and value (US1-2)', async () => {
    const w = await mountSummary([CLAVIER, SOURIS]);
    expect(sent('order-fields/get')).toEqual([{ type: 'order-fields/get', instanceId: 'inst-a' }]);
    expect(sections(w)).toHaveLength(2);
    const s = sections(w)[0]!;
    expect(s.get('legend').text()).toBe(fr['orderFields.section']);
    expect(s.text()).toContain('Order number');
    expect(s.text()).toContain(NUMBER);
    expect((inputFor(s, 'Merchant').element as HTMLInputElement).value).toBe('Amazon.fr');
    expect((inputFor(s, 'Order URL').element as HTMLInputElement).value).toBe(ORDER_URL);
    expect(inputFor(s, 'Order URL').attributes('type')).toBe('url');
  });

  it('the number is read-only, with « Modifiable dans … »; editing the existing field updates it (US1-3, FR-010)', async () => {
    const w = await mountSummary([CLAVIER]);
    const s = sections(w)[0]!;
    expect(s.findAll('label').some((l) => l.text() === 'Order number')).toBe(false);
    expect(s.text()).toContain(fr['orderFields.editAbove']);
    await orderNumberInput(w).setValue('000-0000000-0000009');
    expect(sections(w)[0]!.text()).toContain('000-0000000-0000009');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields![0]).toEqual({
      role: 'orderNumber',
      name: 'Order number',
      value: '000-0000000-0000009',
    });
    expect(submitted(w)!.drafts[0]!.orderNumber).toBe('000-0000000-0000009');
  });

  it('confirm: import/start draft carries the three fields with the values shown (US1-4)', async () => {
    const w = await mountSummary([CLAVIER]);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields).toEqual(ALL);
  });

  it('editing merchant and URL changes neither draft.orderNumber nor draft.pageUrl (FR-011)', async () => {
    const w = await mountSummary([CLAVIER]);
    const s = sections(w)[0]!;
    await inputFor(s, 'Merchant').setValue('  Boutique Exemple ');
    await inputFor(s, 'Order URL').setValue('https://boutique.example.net/commande/1');
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.orderFields).toEqual([
      ALL[0],
      { role: 'merchant', name: 'Merchant', value: 'Boutique Exemple' },
      { role: 'orderUrl', name: 'Order URL', value: 'https://boutique.example.net/commande/1' },
    ]);
    expect(d.orderNumber).toBe(NUMBER);
    expect(d.pageUrl).toBe(ORDER_URL);
  });

  it('two products: each draft carries its own values (US1-5)', async () => {
    const w = await mountSummary([CLAVIER, SOURIS]);
    await inputFor(sections(w)[1]!, 'Merchant').setValue('Boutique B');
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(drafts[0]!.orderFields).toEqual(ALL);
    expect(drafts[1]!.orderFields).toEqual([
      ALL[0],
      { role: 'merchant', name: 'Merchant', value: 'Boutique B' },
      ALL[2],
    ]);
  });

  it('merchant emptied: « Non renseigné » and no merchant entry (FR-012); all empty: no orderFields key', async () => {
    const w = await mountSummary([CLAVIER]);
    await inputFor(sections(w)[0]!, 'Merchant').setValue('');
    expect(sections(w)[0]!.text()).toContain(fr['orderFields.notSet']);
    expect(addButton(w).attributes('disabled')).toBeUndefined();
    await inputFor(sections(w)[0]!, 'Order URL').setValue('');
    await orderNumberInput(w).setValue('');
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderFields');
  });

  it('merchant emptied only: the draft has no merchant entry', async () => {
    const w = await mountSummary([CLAVIER]);
    await inputFor(sections(w)[0]!, 'Merchant').setValue('   ');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields).toEqual([ALL[0], ALL[2]]);
  });

  it('invalid URL: error tied to the input, Add disabled; cleared → enabled again (FR-013)', async () => {
    const w = await mountSummary([CLAVIER]);
    const url = inputFor(sections(w)[0]!, 'Order URL');
    await url.setValue('ftp://x.example');
    expect(url.attributes('aria-invalid')).toBe('true');
    const errorId = url
      .attributes('aria-describedby')!
      .split(' ')
      .find((id) => w.find(`#${CSS.escape(id)}`).text() === fr['orderFields.invalidUrl']);
    expect(errorId).toBeDefined();
    expect(addButton(w).attributes('disabled')).toBeDefined();
    await url.setValue('');
    expect(url.attributes('aria-invalid')).toBeUndefined();
    expect(addButton(w).attributes('disabled')).toBeUndefined();
  });

  it('value of 502 bytes: « Trop long » and Add disabled', async () => {
    const w = await mountSummary([CLAVIER]);
    await inputFor(sections(w)[0]!, 'Merchant').setValue('é'.repeat(251));
    expect(sections(w)[0]!.text()).toContain(fr['orderFields.valueTooLong']);
    expect(addButton(w).attributes('disabled')).toBeDefined();
  });

  it('nothing is written without a click: import/start is never sent, and submit is only emitted on « Ajouter » (FR-029)', async () => {
    const w = await mountSummary([CLAVIER]);
    await inputFor(sections(w)[0]!, 'Merchant').setValue('Boutique');
    expect(w.emitted('submit')).toBeUndefined();
    expect(sentTypes()).not.toContain('import/start');
  });
});

describe('US2: option off — strictly unchanged (FR-014, FR-025, SC-002)', () => {
  const HOMEBOX_TYPES = [
    'detect/run',
    'duplicate/check',
    'location/list',
    'order-fields/get',
    'tag/list',
    'template/list',
  ];

  it('option off: no section; the draft has no orderFields key; only the existing reads + order-fields/get (US2-1)', async () => {
    const w = await mountSummary([CLAVIER], { order: ok({ settings: OFF }) });
    expect(sections(w)).toHaveLength(0);
    expect(w.text()).not.toContain(fr['orderFields.section']);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(Object.keys(d)).not.toContain('orderFields');
    expect(sentTypes()).not.toContain('order-fields/set');
    expect(sentTypes()).not.toContain('order-fields/names');
    expect([...new Set(sentTypes())].sort()).toEqual(HOMEBOX_TYPES);
  });

  it.each([
    ['a failure', fail('INSTANCE_NOT_FOUND')],
    [
      'a malformed answer',
      ok({
        settings: {
          enabled: true,
          names: { orderNumber: 'a=b', merchant: 'Merchant', orderUrl: 'Order URL' },
        },
      }),
    ],
    ['no value', ok(undefined)],
    ['undefined', () => undefined],
    ['a rejection', () => Promise.reject(new Error('closed'))],
  ])('order-fields/get with %s: same result as the option off', async (_label, reply) => {
    const w = await mountSummary([CLAVIER], { order: reply });
    expect(sections(w)).toHaveLength(0);
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderFields');
  });

  it('option on then off between two openings: no section, no key (US2-4)', async () => {
    const on = await mountSummary([CLAVIER], { order: ok({ settings: ON }) });
    expect(sections(on)).toHaveLength(1);
    on.unmount();
    vi.mocked(send).mockReset();
    const off = await mountSummary([CLAVIER], { order: ok({ settings: OFF }) });
    expect(sections(off)).toHaveLength(0);
    await confirm(off);
    expect(Object.keys(submitted(off)!.drafts[0]!)).not.toContain('orderFields');
  });

  it('the draft emitted with the option off equals the one of an instance without setting (default)', async () => {
    const off = await mountSummary([CLAVIER], { order: ok({ settings: OFF }) });
    await confirm(off);
    const a = submitted(off)!.drafts[0]!;
    off.unmount();
    vi.mocked(send).mockReset();
    const none = await mountSummary([CLAVIER], {
      order: ok({ settings: { enabled: false, names: NAMES } }),
    });
    await confirm(none);
    expect(submitted(none)!.drafts[0]).toEqual(a);
    expect(a).toEqual({
      name: 'Clavier sans fil Exemple Pro',
      description: a.description,
      purchasePrice: 49.9,
      currency: 'EUR',
      purchaseDate: '2026-11-03',
      purchaseFrom: a.purchaseFrom,
      orderNumber: NUMBER,
      quantity: 1,
      pageUrl: ORDER_URL,
      documents: a.documents,
      photo: null,
      location: null,
      warranty: a.warranty,
      tags: a.tags,
    });
  });
});

describe('US4: template with a field of the same name (FR-016 to FR-018)', () => {
  const choose = async (w: Mounted, id: string | null, i = 0) => {
    w.findAllComponents(TemplatePicker)[i]!.vm.$emit('update:modelValue', id);
    await flushPromises();
  };
  const templateSection = (w: Mounted) => w.find('fieldset.template-section');
  const templateLabels = (w: Mounted) =>
    templateSection(w)
      .findAll('label')
      .map((l) => l.text());
  const NUMBER_TYPED: TemplateDetail = {
    ...LIVRE,
    fields: [
      {
        type: 'number',
        kind: 'number',
        name: 'Order number',
        textValue: '',
        numberValue: 0,
        booleanValue: false,
      },
      LIVRE.fields[1]!,
    ],
  };

  it('« Livre » chosen: ONE « Order number », in the order fields, prefilled; TemplateSection shows the mention (US4-1)', async () => {
    const w = await mountSummary([CLAVIER]);
    await choose(w, 'tpl-1');
    expect(templateLabels(w)).not.toContain('Order number');
    expect(templateSection(w).text()).toContain(
      fmt('orderFields.mergedInTemplate', 'Order number'),
    );
    const s = sections(w)[0]!;
    expect(s.text()).toContain(NUMBER);
    expect(s.text()).toContain(fmt('orderFields.merged', 'Order number'));
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.orderFields).toEqual(ALL);
    expect(d.template!.fields.map((f) => f.name)).toEqual(['Auteur']);
  });

  it('the number edited: the entry is sent (US4-2)', async () => {
    const w = await mountSummary([CLAVIER]);
    await choose(w, 'tpl-1');
    await orderNumberInput(w).setValue('000-0000000-0000009');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields![0]).toEqual({
      role: 'orderNumber',
      name: 'Order number',
      value: '000-0000000-0000009',
    });
  });

  it('template field « Order number » of type number: kept in the template, no order entry, non-blocking message (US4-3)', async () => {
    const w = await mountSummary([CLAVIER], { details: { 'tpl-1': NUMBER_TYPED } });
    await choose(w, 'tpl-1');
    expect(templateLabels(w)).toContain('Order number');
    const message = fmt('orderFields.typeConflict', 'Order number', fr['orderFields.type.number']!);
    expect(
      sections(w)[0]!
        .findAll('output')
        .some((o) => o.text() === message),
    ).toBe(true);
    expect(addButton(w).attributes('disabled')).toBeUndefined();
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.orderFields!.map((f) => f.role)).toEqual(['merchant', 'orderUrl']);
    expect(d.template!.fields.map((f) => f.name)).toEqual(['Order number', 'Auteur']);
  });

  it('template without a field of the same name: template fields and order fields together, each once (US4-4)', async () => {
    const w = await mountSummary([CLAVIER], {
      details: { 'tpl-1': { ...LIVRE, fields: [LIVRE.fields[1]!] } },
    });
    await choose(w, 'tpl-1');
    expect(templateLabels(w)).toContain('Auteur');
    expect(sections(w)[0]!.text()).not.toContain(fmt('orderFields.merged', 'Order number'));
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields).toEqual(ALL);
  });

  it('change of template or « Aucun »: the order fields stay with their values; the merge is undone (US4-5, FR-018)', async () => {
    const w = await mountSummary([CLAVIER]);
    await choose(w, 'tpl-1');
    await inputFor(sections(w)[0]!, 'Merchant').setValue('Boutique Exemple');
    await orderNumberInput(w).setValue('');
    expect(templateLabels(w)).toContain('Order number');
    await orderNumberInput(w).setValue(NUMBER);
    await choose(w, null);
    expect(templateSection(w).exists()).toBe(false);
    expect((inputFor(sections(w)[0]!, 'Merchant').element as HTMLInputElement).value).toBe(
      'Boutique Exemple',
    );
    await choose(w, 'tpl-2');
    expect((inputFor(sections(w)[0]!, 'Merchant').element as HTMLInputElement).value).toBe(
      'Boutique Exemple',
    );
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields![1]).toEqual({
      role: 'merchant',
      name: 'Merchant',
      value: 'Boutique Exemple',
    });
  });

  it('option off: the template is sent exactly as in spec 018 (no merge)', async () => {
    const w = await mountSummary([CLAVIER], { order: ok({ settings: OFF }) });
    await choose(w, 'tpl-1');
    expect(templateLabels(w)).toContain('Order number');
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(Object.keys(d)).not.toContain('orderFields');
    expect(d.template!.fields.map((f) => f.name)).toEqual(['Order number', 'Auteur']);
  });
});

describe('US5: several instances (FR-015, FR-037)', () => {
  const RENAMED = {
    enabled: true,
    names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
  };
  const switchTo = async (w: Mounted, id: string) => {
    await w.get<HTMLSelectElement>('select#instance-target').setValue(id);
    await flushPromises();
  };
  const announced = (w: Mounted) =>
    w
      .findAll('[aria-live="polite"]')
      .map((l) => l.text())
      .join(' | ');
  const perInstance = (b: unknown) => (instanceId: string) =>
    instanceId === 'inst-b' ? b : ok({ settings: ON });

  it('A on → B off: order-fields/get for B, section removed and announced; back to A: shown again with the merchant kept', async () => {
    const w = await mountSummary(
      [CLAVIER],
      { order: perInstance(ok({ settings: OFF })) },
      config([A, B]),
    );
    expect(sections(w)).toHaveLength(1);
    await inputFor(sections(w)[0]!, 'Merchant').setValue('Boutique Exemple');
    await switchTo(w, 'inst-b');
    expect(sent('order-fields/get').map((m) => m.instanceId)).toEqual(['inst-a', 'inst-b']);
    expect(sections(w)).toHaveLength(0);
    expect(announced(w)).toContain(fr['orderFields.hidden']);
    await switchTo(w, 'inst-a');
    expect(sections(w)).toHaveLength(1);
    expect(announced(w)).toContain(fr['orderFields.shown']);
    expect((inputFor(sections(w)[0]!, 'Merchant').element as HTMLInputElement).value).toBe(
      'Boutique Exemple',
    );
  });

  it('B with other names: the section is renamed (and announced)', async () => {
    const w = await mountSummary(
      [CLAVIER],
      { order: perInstance(ok({ settings: RENAMED })) },
      config([A, B]),
    );
    await switchTo(w, 'inst-b');
    const s = sections(w)[0]!;
    expect(s.findAll('label').map((l) => l.text())).toEqual(['Boutique', 'Lien']);
    expect(s.text()).toContain('N° commande');
    expect(announced(w)).toContain(fr['orderFields.shown']);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.orderFields!.map((f) => f.name)).toEqual([
      'N° commande',
      'Boutique',
      'Lien',
    ]);
  });

  it('confirm on B (option off): drafts without orderFields; nothing sent for A after the change', async () => {
    const w = await mountSummary(
      [CLAVIER],
      { order: perInstance(ok({ settings: OFF })) },
      config([A, B]),
    );
    const before = vi.mocked(send).mock.calls.length;
    await switchTo(w, 'inst-b');
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('orderFields');
    const after = vi
      .mocked(send)
      .mock.calls.slice(before)
      .map((c) => c[0] as { instanceId?: string })
      .filter((m) => m.instanceId !== undefined);
    expect(after.every((m) => m.instanceId === 'inst-b')).toBe(true);
    expect((w.emitted('submit')![0] as [{ instanceId: string }])[0].instanceId).toBe('inst-b');
  });

  it('a late answer of the former instance is ignored', async () => {
    let resolveA!: (v: unknown) => void;
    let calls = 0;
    const order = (instanceId: string) => {
      if (instanceId === 'inst-b') return ok({ settings: OFF });
      calls += 1;
      return calls === 1 ? new Promise((r) => (resolveA = r)) : ok({ settings: ON });
    };
    const w = await mountSummary([CLAVIER], { order }, config([A, B]));
    await switchTo(w, 'inst-b');
    resolveA(ok({ settings: ON }));
    await flushPromises();
    expect(sections(w)).toHaveLength(0);
  });
});
