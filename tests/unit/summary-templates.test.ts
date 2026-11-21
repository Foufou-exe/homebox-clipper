import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok, type ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  LocationOption,
  TemplateCheck,
  TemplateDetail,
  TemplateListView,
  TemplateOption,
} from '@/shared/types';
import TemplatePicker from '@/ui/components/TemplatePicker.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog } from './i18n-harness';

/** Templates in the summary (spec 018, Q-U4, contracts/ui.md §1). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const fmt = (key: string, ...subs: string[]) =>
  subs.reduce((s, v, i) => s.replace(`$${i + 1}`, v), fr[key]!);
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
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    { id: 'detected-0', origin: 'detected', kind: 'invoice', label: 'facture-999.pdf', size: 2048 },
  ],
});
const ROMAN = product('a', 'Roman exemple');
const JEU = product('b', 'Jeu de société exemple');

const LOCATIONS: LocationOption[] = [
  { id: 'loc-1', name: 'Bureau', path: ['Maison', 'Bureau'] },
  { id: 'loc-2', name: 'Étagère A', path: ['Maison', 'Étagère A'] },
];
const OPTIONS: TemplateOption[] = [
  { id: 'tpl-2', name: 'Jeu', description: '' },
  { id: 'tpl-1', name: 'Livre', description: '' },
];
const LIVRE: TemplateDetail = {
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: 'a'.repeat(64),
  description: '',
  quantity: null,
  insured: true,
  manufacturer: 'Éditions Exemple',
  modelNumber: '',
  lifetimeWarranty: false,
  warrantyDetails: '',
  locationId: 'loc-2',
  tags: [{ id: 'tag-1', name: 'Livres' }],
  fields: [
    {
      type: 'text',
      kind: 'text',
      name: 'Auteur',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
    {
      type: 'text',
      kind: 'text',
      name: 'Collection',
      textValue: 'Poche',
      numberValue: 0,
      booleanValue: false,
    },
  ],
};
const JEU_DETAIL: TemplateDetail = {
  ...LIVRE,
  id: 'tpl-2',
  name: 'Jeu',
  fingerprint: 'b'.repeat(64),
  locationId: null,
  tags: [],
  fields: [],
};
const LIVRE_TYPE: TemplateDetail = {
  ...LIVRE,
  fields: [
    {
      type: 'text',
      kind: 'text',
      name: 'Auteur',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
    {
      type: 'number',
      kind: 'number',
      name: 'Pages',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
    {
      type: 'boolean',
      kind: 'boolean',
      name: 'Lu',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
    {
      type: 'time',
      kind: 'time',
      name: 'Lu le',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    },
  ],
};

interface Replies {
  list?: TemplateListView | ErrorCode | Promise<unknown> | ((instanceId: string) => unknown);
  details?: Record<string, TemplateDetail | ErrorCode>;
  check?: TemplateCheck[] | ErrorCode;
  locations?: LocationOption[] | ErrorCode;
  tags?: { id: string; name: string }[];
  defaultRef?: { id: string; name: string } | null;
}
const listOf = (
  templates: TemplateOption[] = OPTIONS,
  over: Partial<TemplateListView> = {},
): TemplateListView => ({
  templates,
  defaultTemplate: null,
  defaultState: 'none',
  ...over,
});

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
        return Promise.resolve(ok({ tags: replies.tags ?? [{ id: 'tag-1', name: 'Livres' }] }));
      case 'location/list': {
        const l = replies.locations ?? LOCATIONS;
        return Promise.resolve(
          typeof l === 'string' ? fail(l) : ok({ locations: l, lastUsedId: null }),
        );
      }
      case 'template/list': {
        const l = replies.list ?? listOf();
        if (typeof l === 'function') return Promise.resolve(l(msg.instanceId!));
        if (l instanceof Promise) return l;
        return Promise.resolve(typeof l === 'string' ? fail(l) : ok(l));
      }
      case 'template/get': {
        const d =
          replies.details?.[msg.templateId!] ?? (msg.templateId === 'tpl-2' ? JEU_DETAIL : LIVRE);
        return Promise.resolve(typeof d === 'string' ? fail(d) : ok({ template: d }));
      }
      case 'template/get-default':
        return Promise.resolve(ok({ defaultTemplate: replies.defaultRef ?? null }));
      case 'template/check': {
        const c = replies.check ?? msg.refs!.map((r) => ({ id: r.id, state: 'same' as const }));
        return Promise.resolve(typeof c === 'string' ? fail(c) : ok({ results: c }));
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

const pickers = (w: Mounted) => w.findAllComponents(TemplatePicker);
const choose = async (w: Mounted, id: string | null, i = 0) => {
  pickers(w)[i]!.vm.$emit('update:modelValue', id);
  await flushPromises();
};
const addButton = (w: Mounted) => w.get('.footer button.primary');
const confirm = async (w: Mounted) => {
  await addButton(w).trigger('click');
  await flushPromises();
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const sent = (type: string) =>
  vi
    .mocked(send)
    .mock.calls.map((c) => c[0] as { type: string } & Record<string, unknown>)
    .filter((m) => m.type === type);
const chooseLocation = async (w: Mounted, id = 'loc-1') => {
  const field = w.findComponent({ name: 'OrderLocationField' });
  const loc = LOCATIONS.find((l) => l.id === id)!;
  field.vm.$emit('update:modelValue', { id: loc.id, path: [...loc.path] });
  await flushPromises();
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('US1: choose a template for a product', () => {
  it('a picker under each product when templates exist; « Aucun » at first; template/list sent with the target instance', async () => {
    const w = await mountSummary([ROMAN, JEU]);
    expect(pickers(w)).toHaveLength(2);
    for (const p of pickers(w)) expect(p.props('modelValue')).toBeNull();
    expect(sent('template/list')).toEqual([{ type: 'template/list', instanceId: 'inst-a' }]);
  });

  it('choosing a template: template/get, product loading (Add disabled), then the values applied', async () => {
    let resolve!: (v: unknown) => void;
    const w = await mountSummary([ROMAN]);
    vi.mocked(send).mockImplementationOnce((() => new Promise((r) => (resolve = r))) as never);
    pickers(w)[0]!.vm.$emit('update:modelValue', 'tpl-1');
    await flushPromises();
    expect(sent('template/get')).toEqual([
      { type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' },
    ]);
    expect(w.text()).toContain(fr['templates.loading']);
    expect(addButton(w).attributes('disabled')).toBeDefined();
    resolve(ok({ template: LIVRE }));
    await flushPromises();
    expect(w.text()).not.toContain(fr['templates.loading']);
    expect(w.find('[aria-live="polite"]').text()).toBe(fmt('templates.applied', 'Livre', '2'));
  });

  it('name never changed; the description of the product wins; tags of the template added (origin template)', async () => {
    const w = await mountSummary([ROMAN], {
      details: { 'tpl-1': { ...LIVRE, description: 'Description du modèle' } },
    });
    await choose(w, 'tpl-1');
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.name).toBe('Roman exemple');
    expect(d.description).toContain('Amazon');
    expect(d.tags).toContainEqual({ name: 'Livres', id: 'tag-1', noCreate: true });
  });

  it('the default location of the template is proposed when the product has none (FR-006)', async () => {
    const w = await mountSummary([ROMAN]);
    await choose(w, 'tpl-1');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.location).toEqual({
      id: 'loc-2',
      path: ['Maison', 'Étagère A'],
    });
  });

  it('location required with a template: alert, aria-invalid, Add disabled; without template, optional (FR-005, FR-007)', async () => {
    const w = await mountSummary([ROMAN]);
    expect(addButton(w).attributes('disabled')).toBeUndefined();
    await choose(w, 'tpl-2');
    const alert = w
      .findAll('[role="alert"]')
      .find((a) => a.text() === fr['templates.locationRequired']);
    expect(alert).toBeDefined();
    expect(w.find('[aria-invalid="true"]').exists()).toBe(true);
    expect(addButton(w).attributes('disabled')).toBeDefined();
    await chooseLocation(w);
    expect(addButton(w).attributes('disabled')).toBeUndefined();
    expect(w.text()).not.toContain(fr['templates.locationRequired']);
  });

  it('locations unavailable + template: the « unavailable » message, Add disabled', async () => {
    const w = await mountSummary([ROMAN], { locations: 'LOCATIONS_UNAVAILABLE' });
    await choose(w, 'tpl-2');
    expect(
      w
        .findAll('[role="alert"]')
        .some((a) => a.text() === fr['templates.locationRequiredUnavailable']),
    ).toBe(true);
    expect(addButton(w).attributes('disabled')).toBeDefined();
  });

  it('back to « Aucun »: what the template set is removed, the user entries kept (US1-8)', async () => {
    const w = await mountSummary([ROMAN]);
    await choose(w, 'tpl-1');
    await choose(w, null);
    expect(w.find('[aria-live="polite"]').text()).toBe(fr['templates.removed']);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(Object.keys(d)).not.toContain('template');
    expect(d.location).toBeNull();
    expect(d.tags ?? []).not.toContainEqual(expect.objectContaining({ name: 'Livres' }));
  });

  it('changing template: the previous one is removed before the next one is applied', async () => {
    const w = await mountSummary([ROMAN]);
    await choose(w, 'tpl-1');
    await choose(w, 'tpl-2');
    await chooseLocation(w);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.template?.id).toBe('tpl-2');
    expect(d.tags ?? []).not.toContainEqual(expect.objectContaining({ name: 'Livres' }));
  });

  it('template/get fails: back to « Aucun », a banner naming the template and a « Réessayer » button (US5-5)', async () => {
    const w = await mountSummary([ROMAN], { details: { 'tpl-1': 'HOMEBOX_UNREACHABLE' } });
    await choose(w, 'tpl-1');
    expect(pickers(w)[0]!.props('modelValue')).toBeNull();
    expect(w.text()).toContain(fmt('templates.loadFailed', 'Livre'));
    const retry = w.findAll('button').find((b) => b.text() === fr['templates.retry'])!;
    expect(retry).toBeDefined();
    vi.mocked(send).mockClear();
    await retry.trigger('click');
    await flushPromises();
    expect(sent('template/get')).toHaveLength(1);
  });

  it('confirmation: each product with a template carries « template » built from the values shown; « Aucun » has no key', async () => {
    const w = await mountSummary([ROMAN, JEU]);
    await choose(w, 'tpl-1', 0);
    await confirm(w);
    expect(sent('template/check')).toEqual([
      {
        type: 'template/check',
        instanceId: 'inst-a',
        refs: [{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }],
      },
    ]);
    const [withT, without] = submitted(w)!.drafts;
    expect(withT!.template).toEqual({
      id: 'tpl-1',
      name: 'Livre',
      fingerprint: 'a'.repeat(64),
      insured: true,
      manufacturer: 'Éditions Exemple',
      modelNumber: '',
      fields: [
        {
          type: 'text',
          kind: 'text',
          name: 'Auteur',
          textValue: '',
          numberValue: 0,
          booleanValue: false,
        },
        {
          type: 'text',
          kind: 'text',
          name: 'Collection',
          textValue: 'Poche',
          numberValue: 0,
          booleanValue: false,
        },
      ],
    });
    expect(withT!.location).not.toBeNull();
    expect(Object.keys(without!)).not.toContain('template');
  });

  it('the picker is disabled while the duplicate check runs', async () => {
    let resolve!: (v: unknown) => void;
    const w = await mountSummary([ROMAN]);
    const original = vi.mocked(send).getMockImplementation()!;
    vi.mocked(send).mockImplementation(((msg: { type: string }) =>
      msg.type === 'duplicate/check'
        ? new Promise((r) => (resolve = r))
        : original(msg as never)) as never);
    await addButton(w).trigger('click');
    await flushPromises();
    expect(pickers(w)[0]!.props('disabled')).toBe(true);
    resolve(ok({ matches: [], similar: [], moreSimilar: false, incomplete: false }));
    await flushPromises();
  });
});

describe('US2: complete the custom fields of the template', () => {
  const field = (w: Mounted, name: string) => {
    const label = w.findAll('.template-section label').find((l) => l.text() === name)!;
    return w.get(`#${CSS.escape(label.attributes('for')!)}`);
  };
  const typed = async () => {
    const w = await mountSummary([ROMAN], { details: { 'tpl-1': LIVRE_TYPE } });
    await choose(w, 'tpl-1');
    return w;
  };

  it('pre-filled per research D1 (number and date only when valid, never timeValue)', async () => {
    const detail: typeof LIVRE_TYPE = {
      ...LIVRE_TYPE,
      fields: [
        {
          type: 'text',
          kind: 'text',
          name: 'Auteur',
          textValue: 'Jane Doe',
          numberValue: 0,
          booleanValue: false,
        },
        {
          type: 'number',
          kind: 'number',
          name: 'Pages',
          textValue: 'abc',
          numberValue: 0,
          booleanValue: false,
        },
        {
          type: 'boolean',
          kind: 'boolean',
          name: 'Lu',
          textValue: '',
          numberValue: 0,
          booleanValue: true,
        },
        {
          type: 'time',
          kind: 'time',
          name: 'Lu le',
          textValue: '2026-11-01',
          numberValue: 0,
          booleanValue: false,
        },
      ],
    };
    const w = await mountSummary([ROMAN], { details: { 'tpl-1': detail } });
    await choose(w, 'tpl-1');
    expect((field(w, 'Auteur').element as HTMLInputElement).value).toBe('Jane Doe');
    expect((field(w, 'Pages').element as HTMLInputElement).value).toBe('');
    expect((field(w, 'Lu').element as HTMLInputElement).checked).toBe(true);
    expect((field(w, 'Lu le').element as HTMLInputElement).value).toBe('2026-11-01');
  });

  it('values entered → exact fields sent (D1)', async () => {
    const w = await typed();
    await field(w, 'Auteur').setValue('Jane Doe');
    await field(w, 'Pages').setValue('320');
    await field(w, 'Lu').setValue(true);
    await field(w, 'Lu le').setValue('2026-11-01');
    await chooseLocation(w);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.template!.fields).toEqual([
      {
        type: 'text',
        kind: 'text',
        name: 'Auteur',
        textValue: 'Jane Doe',
        numberValue: 0,
        booleanValue: false,
      },
      {
        type: 'number',
        kind: 'number',
        name: 'Pages',
        textValue: '320',
        numberValue: 320,
        booleanValue: false,
      },
      {
        type: 'boolean',
        kind: 'boolean',
        name: 'Lu',
        textValue: 'true',
        numberValue: 0,
        booleanValue: true,
      },
      {
        type: 'time',
        kind: 'time',
        name: 'Lu le',
        textValue: '2026-11-01',
        numberValue: 0,
        booleanValue: false,
      },
    ]);
  });

  it('empty number → textValue empty, numberValue 0; manufacturer, model number and insured changed (FR-014)', async () => {
    const w = await typed();
    await field(w, fr['templates.manufacturer']!).setValue('Autre éditeur');
    await field(w, fr['templates.modelNumber']!).setValue('M-2');
    await field(w, fr['templates.insured']!).setValue(false);
    await chooseLocation(w);
    await confirm(w);
    const t = submitted(w)!.drafts[0]!.template!;
    expect(t.fields[1]).toEqual({
      type: 'number',
      kind: 'number',
      name: 'Pages',
      textValue: '',
      numberValue: 0,
      booleanValue: false,
    });
    expect(t).toMatchObject({ manufacturer: 'Autre éditeur', modelNumber: 'M-2', insured: false });
  });

  it.each(['3,5', 'abc'])(
    '« %s » in a number field blocks the confirmation; correcting it unblocks',
    async (value) => {
      const w = await typed();
      await chooseLocation(w);
      await field(w, 'Pages').setValue(value);
      expect(addButton(w).attributes('disabled')).toBeDefined();
      expect(w.text()).toContain(fr['templates.errors.notInteger']);
      await field(w, 'Pages').setValue('');
      expect(addButton(w).attributes('disabled')).toBeUndefined();
    },
  );

  it('an unknown type is copied as is', async () => {
    const w = await mountSummary([ROMAN], {
      details: {
        'tpl-1': {
          ...LIVRE,
          fields: [
            {
              type: 'color',
              kind: 'unknown',
              name: 'Couleur',
              textValue: 'rouge',
              numberValue: 2,
              booleanValue: true,
            },
          ],
        },
      },
    });
    await choose(w, 'tpl-1');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.template!.fields).toEqual([
      {
        type: 'color',
        kind: 'unknown',
        name: 'Couleur',
        textValue: 'rouge',
        numberValue: 2,
        booleanValue: true,
      },
    ]);
  });
});

describe('US3: without template, the import is strictly unchanged', () => {
  it('template/list with 0 template: no picker, no banner (US3-3)', async () => {
    const w = await mountSummary([ROMAN, JEU], { list: listOf([]) });
    expect(pickers(w)).toHaveLength(0);
    expect(w.find('.template-section').exists()).toBe(false);
    expect(w.findAll('[role="alert"]')).toHaveLength(0);
  });

  it('templates available but « Aucun » everywhere: the exact import message of before the feature', async () => {
    const w = await mountSummary([ROMAN]);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(Object.keys(d)).not.toContain('template');
    expect(d.location).toBeNull();
    expect(d.tags).toEqual([{ name: 'Amazon' }]);
    expect(sent('template/get')).toEqual([]);
    expect(sent('template/check')).toEqual([]);
    // Same message as with an instance without any template (the summary of before the feature).
    document.body.innerHTML = '';
    const plain = await mountSummary([ROMAN], { list: listOf([]) });
    await confirm(plain);
    expect(submitted(plain)).toEqual(submitted(w));
  });

  it('mixed batch « Livre » + « Aucun »: only the first carries template', async () => {
    const w = await mountSummary([ROMAN, JEU]);
    await choose(w, 'tpl-1', 0);
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(drafts.map((d) => Object.keys(d).includes('template'))).toEqual([true, false]);
    expect(drafts[1]!.tags?.some((t) => 'noCreate' in t) ?? false).toBe(false);
  });
});

describe('US4: default template of the instance in the summary', () => {
  it('defaultState ok: preselected on each product selected at opening (then template/get), changeable per product', async () => {
    const w = await mountSummary([ROMAN, JEU], {
      list: listOf(OPTIONS, {
        defaultTemplate: { id: 'tpl-1', name: 'Livre' },
        defaultState: 'ok',
      }),
    });
    expect(pickers(w).map((p) => p.props('modelValue'))).toEqual(['tpl-1', 'tpl-1']);
    expect(sent('template/get')).toEqual([
      { type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' },
    ]);
    await choose(w, null, 1);
    expect(pickers(w).map((p) => p.props('modelValue'))).toEqual(['tpl-1', null]);
  });

  it('defaultState missing: products on « Aucun » and the « defaultMissing » message (FR-023)', async () => {
    const w = await mountSummary([ROMAN], {
      list: listOf(OPTIONS, {
        defaultTemplate: { id: 'tpl-9', name: 'Ancien' },
        defaultState: 'missing',
      }),
    });
    expect(pickers(w)[0]!.props('modelValue')).toBeNull();
    expect(w.text()).toContain(fr['templates.defaultMissing']);
  });

  it('list unavailable with a remembered default: « defaultNotApplied », import without template possible (US5-4)', async () => {
    const w = await mountSummary([ROMAN], {
      list: 'HOMEBOX_UNREACHABLE',
      defaultRef: { id: 'tpl-1', name: 'Livre' },
    });
    expect(w.text()).toContain(fr['templates.defaultNotApplied']);
    expect(pickers(w)).toHaveLength(0);
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('template');
  });

  it('a product unselected at opening gets no default; selected again later, it stays on « Aucun » (fixed behaviour)', async () => {
    let resolve!: (v: unknown) => void;
    const list = new Promise((r) => (resolve = r));
    const w = await mountSummary([ROMAN, JEU], { list });
    await w.findAll('.line .pick input[type="checkbox"]')[1]!.setValue(false);
    resolve(
      ok(listOf(OPTIONS, { defaultTemplate: { id: 'tpl-1', name: 'Livre' }, defaultState: 'ok' })),
    );
    await flushPromises();
    await w.findAll('.line .pick input[type="checkbox"]')[1]!.setValue(true);
    await flushPromises();
    expect(pickers(w).map((p) => p.props('modelValue'))).toEqual(['tpl-1', null]);
  });
});

describe('US5: several instances, templates unavailable', () => {
  const two = config([A, B]);
  const perInstance = (instanceId: string) =>
    ok(
      instanceId === 'inst-a'
        ? listOf(OPTIONS, { defaultTemplate: { id: 'tpl-1', name: 'Livre' }, defaultState: 'ok' })
        : listOf([{ id: 'tpl-3', name: 'Outil', description: '' }], {
            defaultTemplate: { id: 'tpl-3', name: 'Outil' },
            defaultState: 'ok',
          }),
    );
  const outil: TemplateDetail = {
    ...JEU_DETAIL,
    id: 'tpl-3',
    name: 'Outil',
    fingerprint: 'c'.repeat(64),
  };
  const changeTarget = async (w: Mounted, id: string) => {
    w.findComponent({ name: 'InstancePicker' }).vm.$emit('update:modelValue', id);
    await flushPromises();
  };

  it('changing the target: the template of A and what it set are removed, template/list of B, default of B applied (US5-1)', async () => {
    const w = await mountSummary([ROMAN], { list: perInstance, details: { 'tpl-3': outil } }, two);
    expect(pickers(w)[0]!.props('modelValue')).toBe('tpl-1');
    vi.mocked(send).mockClear();
    await changeTarget(w, 'inst-b');
    expect(sent('template/list')).toEqual([{ type: 'template/list', instanceId: 'inst-b' }]);
    expect(pickers(w)[0]!.props('modelValue')).toBe('tpl-3');
    expect(
      pickers(w)[0]!
        .props('options')
        .map((o: TemplateOption) => o.id),
    ).toEqual(['tpl-3']);
    const afterChange = vi
      .mocked(send)
      .mock.calls.map(([m]) => m as unknown as { instanceId?: string });
    expect(afterChange.some((m) => m.instanceId === 'inst-a')).toBe(false);
    await chooseLocation(w);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.template?.id).toBe('tpl-3');
    expect(d.tags ?? []).not.toContainEqual(expect.objectContaining({ name: 'Livres' }));
  });

  it('out-of-order answers: a template/list or template/get of a former target is ignored (US5-2)', async () => {
    let releaseA!: (v: unknown) => void;
    const slowList = new Promise((r) => (releaseA = r));
    let first = true;
    const w = await mountSummary(
      [ROMAN],
      {
        list: (id: string) => {
          if (id === 'inst-a' && first) {
            first = false;
            return slowList;
          }
          return perInstance(id);
        },
        details: { 'tpl-3': outil },
      },
      two,
    );
    await changeTarget(w, 'inst-b');
    releaseA(ok(listOf(OPTIONS)));
    await flushPromises();
    expect(
      pickers(w)[0]!
        .props('options')
        .map((o: TemplateOption) => o.id),
    ).toEqual(['tpl-3']);
    expect(pickers(w)[0]!.props('modelValue')).toBe('tpl-3');
  });

  it.each([
    'TEMPLATES_UNAVAILABLE',
    'TEMPLATES_UNSUPPORTED',
    'UNAUTHORIZED',
    'HOMEBOX_UNREACHABLE',
  ] as const)(
    'list error %s: banner of the code + « Réessayer » which sends template/list again; import without template possible (US5-3)',
    async (code) => {
      const w = await mountSummary([ROMAN], { list: code });
      expect(w.text()).toContain(fr[`error.${code}`]);
      expect(pickers(w)).toHaveLength(0);
      const retry = w.findAll('button').find((b) => b.text() === fr['templates.retry'])!;
      vi.mocked(send).mockClear();
      await retry.trigger('click');
      await flushPromises();
      expect(sent('template/list')).toEqual([{ type: 'template/list', instanceId: 'inst-a' }]);
      await confirm(w);
      expect(submitted(w)).toBeDefined();
    },
  );

  it('instance B without template: no picker (US3-3 for B)', async () => {
    const w = await mountSummary(
      [ROMAN],
      { list: (id: string) => (id === 'inst-a' ? ok(listOf()) : ok(listOf([]))) },
      two,
    );
    expect(pickers(w)).toHaveLength(1);
    await changeTarget(w, 'inst-b');
    expect(pickers(w)).toHaveLength(0);
  });
});

describe('US6: template changed or deleted between the choice and the import', () => {
  it('after the duplicate check, template/check with the distinct templates and the fingerprint of the detail shown', async () => {
    const w = await mountSummary([ROMAN, JEU]);
    await choose(w, 'tpl-1', 0);
    await choose(w, 'tpl-1', 1);
    await confirm(w);
    const order = vi
      .mocked(send)
      .mock.calls.map(([m]) => (m as { type: string }).type)
      .filter((t) => t === 'duplicate/check' || t === 'template/check');
    expect(order).toEqual(['duplicate/check', 'duplicate/check', 'template/check']);
    expect(sent('template/check')[0]!.refs).toEqual([{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }]);
    expect(submitted(w)).toBeDefined();
  });

  it('missing: no import, the choice kept and marked TEMPLATE_NOT_FOUND, products named, no switch to « Aucun » (FR-021)', async () => {
    const w = await mountSummary([ROMAN, JEU], { check: [{ id: 'tpl-1', state: 'missing' }] });
    await choose(w, 'tpl-1', 0);
    await confirm(w);
    expect(w.emitted('submit')).toBeUndefined();
    expect(pickers(w)[0]!.props('modelValue')).toBe('tpl-1');
    expect(w.text()).toContain(fr['error.TEMPLATE_NOT_FOUND']);
    expect(w.text()).toContain(fmt('templates.goneBeforeImport', 'Livre', 'Roman exemple'));
    expect(addButton(w).attributes('disabled')).toBeDefined();
    await choose(w, null, 0);
    expect(addButton(w).attributes('disabled')).toBeUndefined();
  });

  it('changed: no import, the new detail replaces the old one, values entered kept, changes listed, new confirmation', async () => {
    const changed: TemplateDetail = {
      ...LIVRE,
      fingerprint: 'd'.repeat(64),
      fields: [
        {
          type: 'text',
          kind: 'text',
          name: 'Auteur',
          textValue: '',
          numberValue: 0,
          booleanValue: false,
        },
        {
          type: 'text',
          kind: 'text',
          name: 'Éditeur',
          textValue: '',
          numberValue: 0,
          booleanValue: false,
        },
      ],
    };
    const w = await mountSummary([ROMAN], {
      check: [{ id: 'tpl-1', state: 'changed', template: changed }],
    });
    await choose(w, 'tpl-1');
    const label = w.findAll('.template-section label').find((l) => l.text() === 'Auteur')!;
    await w.get(`#${CSS.escape(label.attributes('for')!)}`).setValue('Jane Doe');
    await confirm(w);
    expect(w.emitted('submit')).toBeUndefined();
    expect(w.text()).toContain(fmt('templates.changedList', 'Livre', '+ Éditeur, − Collection'));
    expect(w.findAll('.template-section label').map((l) => l.text())).toContain('Éditeur');
    // New confirmation: now the same.
    vi.mocked(send).mockImplementation(
      ((orig) => (msg: { type: string; refs?: { id: string }[] }) =>
        msg.type === 'template/check'
          ? Promise.resolve(ok({ results: [{ id: 'tpl-1', state: 'same' }] }))
          : orig(msg as never))(vi.mocked(send).getMockImplementation()!) as never,
    );
    await confirm(w);
    const t = submitted(w)!.drafts[0]!.template!;
    expect(t.fingerprint).toBe('d'.repeat(64));
    expect(t.fields.map((f) => [f.name, f.textValue])).toEqual([
      ['Auteur', 'Jane Doe'],
      ['Éditeur', ''],
    ]);
  });

  it('template/check fails: the code shown, nothing sent', async () => {
    const w = await mountSummary([ROMAN], { check: 'HOMEBOX_UNREACHABLE' });
    await choose(w, 'tpl-1');
    await confirm(w);
    expect(w.emitted('submit')).toBeUndefined();
    expect(w.text()).toContain(fr['error.HOMEBOX_UNREACHABLE']);
  });

  it('without template: no template/check (US3)', async () => {
    const w = await mountSummary([ROMAN]);
    await confirm(w);
    expect(sent('template/check')).toEqual([]);
    expect(submitted(w)).toBeDefined();
  });
});
