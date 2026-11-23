import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  LocationOption,
  TemplateDetail,
} from '@/shared/types';
import TemplatePicker from '@/ui/components/TemplatePicker.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { completedDraft, previewDraft } from '@/ui/popup/completion';
import { draft as baseDraft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

/** Manufacturer, model and serial number in the summary (spec 027, Q-U1, contracts/ui.md). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const A = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready' as const,
};
const config: ConfigView = { configured: true, instances: [A], defaultInstanceId: A.id };
const found = <T>(value: T) => ({ value, selector: 'x' });
const absent = { value: null, reason: 'not_found' as const };
const product = (
  key: string,
  name: string,
  over: Partial<DetectedProduct> = {},
): DetectedProduct => ({
  key,
  name: found(name),
  unitPrice: found(49.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: absent,
  ...over,
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
const WITH_IDS = product('B000000001', 'Clavier fictif', {
  manufacturer: found('Fabricant Fictif'),
  modelNumber: found('MOD-0001'),
});
const LOOKED_UP_NOTHING = product('B000000002', 'Souris fictive', {
  manufacturer: absent,
  modelNumber: absent,
});
const NOT_LOOKED_UP = product('item-0', 'Câble fictif');

const LOCATIONS: LocationOption[] = [{ id: 'loc-1', name: 'Bureau', path: ['Maison', 'Bureau'] }];
const detail = (over: Partial<TemplateDetail> = {}): TemplateDetail => ({
  id: 'tpl-1',
  name: 'Appareil',
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
  fields: [],
  ...over,
});

async function mountSummary(
  products: DetectedProduct[] | null,
  template: TemplateDetail = detail(),
) {
  vi.mocked(send).mockImplementation(((msg: { type: string; refs?: { id: string }[] }) => {
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
        return Promise.resolve(ok({ locations: LOCATIONS, lastUsedId: null }));
      case 'template/list':
        return Promise.resolve(
          ok({
            templates: [{ id: 'tpl-1', name: 'Appareil', description: '' }],
            defaultTemplate: null,
            defaultState: 'none',
          }),
        );
      case 'template/get':
        return Promise.resolve(ok({ template }));
      case 'template/get-default':
        return Promise.resolve(ok({ defaultTemplate: null }));
      case 'template/check':
        return Promise.resolve(
          ok({ results: msg.refs!.map((r) => ({ id: r.id, state: 'same' })) }),
        );
      case 'order-fields/get':
        return Promise.resolve(fail('BAD_MESSAGE'));
      default:
        return Promise.resolve(ok(undefined));
    }
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}
type Mounted = Awaited<ReturnType<typeof mountSummary>>;

const input = (w: Mounted, label: string, i = 0) => {
  const labels = w.findAll('.identifiers label').filter((l) => l.text() === label);
  const id = labels[i]?.attributes('for');
  return w.get(`[id="${id}"]`);
};
const value = (w: Mounted, label: string, i = 0) =>
  (input(w, label, i).element as HTMLInputElement).value;
const button = (w: Mounted) => w.get('.footer button.primary');
const confirm = async (w: Mounted) => {
  await button(w).trigger('click');
  await flushPromises();
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const MANUFACTURER = fr['identifiers.manufacturer']!;
const MODEL = fr['identifiers.modelNumber']!;
const SERIAL = fr['identifiers.serialNumber']!;

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('identification section (spec 027)', () => {
  it('pre-filled manufacturer and model, empty serial number, native labelled inputs, no ARIA combobox', async () => {
    const w = await mountSummary([WITH_IDS]);
    expect(w.find('.identifiers legend').text()).toBe(fr['identifiers.legend']);
    expect(value(w, MANUFACTURER)).toBe('Fabricant Fictif');
    expect(value(w, MODEL)).toBe('MOD-0001');
    expect(value(w, SERIAL)).toBe('');
    expect(w.text()).toContain(fr['identifiers.serialHelp']);
    expect(w.findAll('.identifiers [role="combobox"], .identifiers [role="listbox"]')).toHaveLength(
      0,
    );
    expect(w.text()).not.toContain(fr['identifiers.notFound']);
  });

  it('confirm: the cleaned values are in the draft; the serial number typed is sent too', async () => {
    const w = await mountSummary([WITH_IDS]);
    await input(w, MODEL).setValue('  MOD-0001-B ');
    await input(w, SERIAL).setValue('SN-FICTIF-01');
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.identifiers).toEqual({
      manufacturer: 'Fabricant Fictif',
      modelNumber: 'MOD-0001-B',
      serialNumber: 'SN-FICTIF-01',
    });
  });

  it('fields emptied: no key at all in the draft (FR-009)', async () => {
    const w = await mountSummary([WITH_IDS]);
    await input(w, MANUFACTURER).setValue('');
    await input(w, MODEL).setValue('   ');
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('identifiers');
  });

  it('page looked up without values: empty fields and the discreet mention, never an alert; import possible (US3)', async () => {
    const w = await mountSummary([LOOKED_UP_NOTHING]);
    expect(value(w, MANUFACTURER)).toBe('');
    const note = w.findAll('.identifiers p').find((p) => p.text() === fr['identifiers.notFound']);
    expect(note).toBeDefined();
    expect(note!.attributes('role')).toBeUndefined();
    expect(button(w).attributes('disabled')).toBeUndefined();
    await confirm(w);
    expect(Object.keys(submitted(w)!.drafts[0]!)).not.toContain('identifiers');
  });

  it('product not looked up (no ASIN) and manual entry: empty fields, no mention', async () => {
    const w = await mountSummary([NOT_LOOKED_UP]);
    expect(value(w, MANUFACTURER)).toBe('');
    expect(w.text()).not.toContain(fr['identifiers.notFound']);
    const manual = await mountSummary(null);
    expect(manual.findAll('.identifiers input')).toHaveLength(3);
    expect(manual.text()).not.toContain(fr['identifiers.notFound']);
  });

  it('a value over 255 bytes shows a message and blocks the confirmation', async () => {
    const w = await mountSummary([WITH_IDS]);
    await input(w, SERIAL).setValue('é'.repeat(128));
    expect(w.text()).toContain(fr['identifiers.tooLong']!.replace('$1', '255'));
    expect(input(w, SERIAL).attributes('aria-invalid')).toBe('true');
    expect(button(w).attributes('disabled')).toBeDefined();
  });

  it('several products: each keeps its own values', async () => {
    const other = product('B000000003', 'Écran fictif', {
      manufacturer: found('Autre Fabricant'),
      modelNumber: found('MOD-0003'),
    });
    const w = await mountSummary([WITH_IDS, other]);
    expect(value(w, MANUFACTURER, 1)).toBe('Autre Fabricant');
    await confirm(w);
    expect(submitted(w)!.drafts.map((d) => d.identifiers?.modelNumber)).toEqual([
      'MOD-0001',
      'MOD-0003',
    ]);
  });
});

describe('with an item template (D3)', () => {
  const choose = async (w: Mounted) => {
    w.findAllComponents(TemplatePicker)[0]!.vm.$emit('update:modelValue', 'tpl-1');
    await flushPromises();
  };

  it('template without manufacturer nor model: its section is pre-filled; only the serial number stays here', async () => {
    const w = await mountSummary([WITH_IDS]);
    await choose(w);
    expect(w.findAll('.identifiers input')).toHaveLength(1);
    expect(w.text()).toContain(fr['identifiers.templateNote']);
    await input(w, SERIAL).setValue('SN-FICTIF-01');
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.template).toMatchObject({ manufacturer: 'Fabricant Fictif', modelNumber: 'MOD-0001' });
    expect(d.identifiers).toEqual({ serialNumber: 'SN-FICTIF-01' });
  });

  it('a template value is never replaced by the page value', async () => {
    const w = await mountSummary([WITH_IDS], detail({ manufacturer: 'Fabricant Du Modèle' }));
    await choose(w);
    await confirm(w);
    const d = submitted(w)!.drafts[0]!;
    expect(d.template).toMatchObject({
      manufacturer: 'Fabricant Du Modèle',
      modelNumber: 'MOD-0001',
    });
    expect(Object.keys(d)).not.toContain('identifiers');
  });

  it('removing the template brings the three fields back with the line values', async () => {
    const w = await mountSummary([WITH_IDS]);
    await choose(w);
    w.findAllComponents(TemplatePicker)[0]!.vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(value(w, MANUFACTURER)).toBe('Fabricant Fictif');
    expect(value(w, MODEL)).toBe('MOD-0001');
  });
});

describe('completion path is not extended (FR-013)', () => {
  it('previewDraft and completedDraft drop the identifiers', () => {
    const d = baseDraft({ identifiers: { serialNumber: 'SN-FICTIF-01' } });
    expect(Object.keys(previewDraft(d))).not.toContain('identifiers');
    const choice = { entityId: 'item-1', itemName: 'Clavier', keys: ['photo' as const] };
    expect(Object.keys(completedDraft(d, choice))).not.toContain('identifiers');
  });
});
