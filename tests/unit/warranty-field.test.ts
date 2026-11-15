import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { NoDefaultReason } from '@/shared/warranty';
import type { WarrantyDraft } from '@/shared/types';
import WarrantyField from '@/ui/components/WarrantyField.vue';
import { loadCatalog, setTestLanguage } from './i18n-harness';

const fr = loadCatalog('fr');
const sub = (key: string, ...args: string[]) => fr[key]!.replace(/\$([1-9])/g, (_, n: string) => args[Number(n) - 1] ?? '');

const legal = (over: Partial<WarrantyDraft> = {}): WarrantyDraft => ({
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'Garantie légale de conformité (2 ans)',
  durationMonths: 24,
  edited: false,
  ...over,
});

interface Props {
  modelValue: WarrantyDraft | null;
  reason: NoDefaultReason | null;
  purchaseDate: string | null;
  multi: boolean;
  productName: string;
  manualMonths: number;
}

type W = VueWrapper;

/** Mounts the component with a working `v-model` (the parent applies each update). */
function mountField(over: Partial<Props> = {}): W {
  const wrapper: W = mount(WarrantyField, {
    attachTo: document.body,
    props: {
      modelValue: legal(),
      reason: null,
      purchaseDate: '2026-11-03',
      multi: false,
      productName: 'Clavier sans fil Exemple Pro',
      manualMonths: 24,
      ...over,
      'onUpdate:modelValue': (v: WarrantyDraft | null | undefined) => {
        void wrapper.setProps({ modelValue: v });
      },
    },
  });
  return wrapper;
}
const model = (w: W) => (w.props() as { modelValue: WarrantyDraft | null }).modelValue;
const dateInput = (w: W) => w.get('input[type="date"]');
const lifeBox = (w: W) => w.get('input[type="checkbox"]');
const details = (w: W) => w.get('textarea');
const buttonWith = (w: W, text: string) => w.findAll('button').find((b) => b.text() === text);
const status = (w: W) => w.get('[role="status"]');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WarrantyField: a proposed warranty (011, Q-U16, FR-001, principle IV)', () => {
  it('title, origin, visible labels linked by for/id, indicative help and the remove button', () => {
    const w = mountField();
    expect(w.get('h3').text()).toBe(fr['warranty.title']);
    expect(w.text()).toContain(fr['warranty.origin.legal']);
    for (const [selector, label] of [
      ['input[type="date"]', fr['warranty.expires']],
      ['input[type="checkbox"]', fr['warranty.lifetime']],
      ['textarea', fr['warranty.details']],
    ] as const) {
      const input = w.get(selector);
      const lab = w.findAll('label').find((l) => l.attributes('for') === input.attributes('id') || l.find(selector).exists());
      expect(lab?.text(), selector).toContain(label);
    }
    const help = w.get('.help');
    expect(help.text()).toBe(fr['warranty.help']);
    for (const sel of ['input[type="date"]', 'textarea']) {
      expect(w.get(sel).attributes('aria-describedby')).toContain(help.attributes('id'));
    }
    expect(buttonWith(w, fr['warranty.remove']!)).toBeTruthy();
  });

  it('shows exactly what will be sent: date, checkbox and details', () => {
    const w = mountField();
    expect((dateInput(w).element as HTMLInputElement).value).toBe('2028-11-03');
    expect((lifeBox(w).element as HTMLInputElement).checked).toBe(false);
    expect((details(w).element as HTMLTextAreaElement).value).toBe('Garantie légale de conformité (2 ans)');
  });

  it('the date has no maximum (a warranty expires in the future); the details are limited to 1000', () => {
    const w = mountField();
    expect(dateInput(w).attributes('max')).toBeUndefined();
    expect(details(w).attributes('maxlength')).toBe('1000');
  });

  it('origin "user" and "page" are displayed', () => {
    expect(mountField({ modelValue: legal({ origin: 'user' }) }).text()).toContain(fr['warranty.origin.user']);
    expect(mountField({ modelValue: legal({ origin: 'page' }) }).text()).toContain(fr['warranty.origin.page']);
  });

  it('English interface: texts come from the English catalog', () => {
    setTestLanguage('en');
    const w = mountField();
    const en = loadCatalog('en');
    expect(w.get('h3').text()).toBe(en['warranty.title']);
    expect(w.text()).toContain(en['warranty.origin.legal']);
    expect(buttonWith(w, en['warranty.remove']!)).toBeTruthy();
  });
});

describe('WarrantyField: empty section (011, FR-003, SC-003, clarifications 1 and 2)', () => {
  it.each(['seller', 'country', 'disabled'] as const)('reason %s: text, link to the button, add button present', (reason) => {
    const w = mountField({ modelValue: null, reason });
    expect(w.text()).toContain(fr['warranty.none']);
    const reasonEl = w.get('.reason');
    expect(reasonEl.text()).toBe(fr[`warranty.reason.${reason}`]);
    const add = buttonWith(w, fr['warranty.add']!)!;
    expect(add).toBeTruthy();
    expect(add.attributes('aria-describedby')).toBe(reasonEl.attributes('id'));
    expect(w.find('input[type="date"]').exists()).toBe(false);
  });

  it('the exact reason texts of the contract', () => {
    expect(fr['warranty.reason.seller']).toBe('Aucune garantie légale proposée : le vendeur n’est pas la boutique elle-même (place de marché).');
    expect(fr['warranty.reason.disabled']).toBe('Aucune garantie par défaut : elle est désactivée dans la configuration.');
  });

  it('no reason at all (manual entry without reason): still the add button', () => {
    const w = mountField({ modelValue: null, reason: null });
    expect(w.find('.reason').exists()).toBe(false);
    expect(buttonWith(w, fr['warranty.add']!)).toBeTruthy();
  });
});

describe('WarrantyField: remove and add (011, SC-004, principles II and IV)', () => {
  it('remove: warranty becomes null, announced, focus on "Add a warranty", no reason shown', async () => {
    const w = mountField({ reason: 'seller' });
    await buttonWith(w, fr['warranty.remove']!)!.trigger('click');
    await flushPromises();
    expect(model(w)).toBeNull();
    expect(status(w).text()).toBe(fr['warranty.removed']);
    expect(document.activeElement).toBe(buttonWith(w, fr['warranty.add']!)!.element);
    expect(w.find('.reason').exists()).toBe(false);
  });

  it('add: a "user" warranty, not edited, empty details, the duration given by the prop; focus on the date', async () => {
    const w = mountField({ modelValue: null, reason: 'country', manualMonths: 36 });
    await buttonWith(w, fr['warranty.add']!)!.trigger('click');
    await flushPromises();
    expect(model(w)).toEqual({
      origin: 'user',
      expires: '2029-11-03',
      lifetime: false,
      details: '',
      durationMonths: 36,
      edited: false,
    });
    expect(status(w).text()).toBe(fr['warranty.added']);
    expect(document.activeElement).toBe(dateInput(w).element);
  });

  it('add then remove: no warranty', async () => {
    const w = mountField({ modelValue: null });
    await buttonWith(w, fr['warranty.add']!)!.trigger('click');
    await buttonWith(w, fr['warranty.remove']!)!.trigger('click');
    expect(model(w)).toBeNull();
  });

  it('SC-004: keeping = 0 interaction, removing = 1 click, changing the date = 1 input', async () => {
    const w = mountField();
    expect(w.emitted('update:modelValue')).toBeUndefined();
    await dateInput(w).setValue('2029-01-01');
    expect(w.emitted('update:modelValue')).toHaveLength(1);
    await buttonWith(w, fr['warranty.remove']!)!.trigger('click');
    expect(w.emitted('update:modelValue')).toHaveLength(2);
  });
});

describe('WarrantyField: edits (011, R6, FR-005)', () => {
  it('lifetime checked: date disabled (value kept), unchecked: enabled again', async () => {
    const w = mountField();
    await lifeBox(w).setValue(true);
    expect(dateInput(w).attributes('disabled')).toBeDefined();
    expect(model(w)).toMatchObject({ lifetime: true, expires: '2028-11-03', edited: true });
    await lifeBox(w).setValue(false);
    expect(dateInput(w).attributes('disabled')).toBeUndefined();
    expect(model(w)).toMatchObject({ lifetime: false, expires: '2028-11-03' });
  });

  it.each([
    ['date', (w: W) => dateInput(w).setValue('2029-02-02')],
    ['checkbox', (w: W) => lifeBox(w).setValue(true)],
    ['details', (w: W) => details(w).setValue('Autre')],
  ])('any input (%s) makes it edited, shows the note, keeps the origin', async (_label, act) => {
    const w = mountField();
    expect(w.text()).not.toContain(fr['warranty.edited']);
    await act(w);
    expect(model(w)).toMatchObject({ edited: true, origin: 'legal' });
    expect(w.text()).toContain(fr['warranty.edited']);
  });

  it('typing a date sets it; erasing it gives null', async () => {
    const w = mountField();
    await dateInput(w).setValue('2029-02-02');
    expect(model(w)?.expires).toBe('2029-02-02');
    await dateInput(w).setValue('');
    expect(model(w)?.expires).toBeNull();
  });
});

describe('WarrantyField: errors (011, FR-001)', () => {
  it('invalid date → role=alert list with the catalog text', () => {
    const w = mountField({ modelValue: legal({ expires: '2026-02-30' }) });
    const list = w.get('ul[role="alert"]');
    expect(list.text()).toContain(fr['warranty.errors.dateInvalid']);
  });

  it('details over 1000 characters → catalog text', () => {
    const w = mountField({ modelValue: legal({ details: 'a'.repeat(1001) }) });
    expect(w.get('ul[role="alert"]').text()).toContain(fr['warranty.errors.detailsTooLong']);
  });

  it('a valid warranty shows no error list', () => {
    expect(mountField().find('ul[role="alert"]').exists()).toBe(false);
  });
});

describe('WarrantyField: purchase date and expiry notes (011, FR-005, US1-4, US1-5)', () => {
  it('purchase date absent: message under the date, expiry stays null', () => {
    const w = mountField({ modelValue: legal({ expires: null }), purchaseDate: null });
    expect(w.text()).toContain(fr['warranty.noPurchaseDate']);
    expect((dateInput(w).element as HTMLInputElement).value).toBe('');
  });

  it('purchase date typed later, not edited: the expiry is computed', async () => {
    const w = mountField({ modelValue: legal({ expires: null }), purchaseDate: null });
    await w.setProps({ purchaseDate: '2026-11-03' });
    expect(model(w)?.expires).toBe('2028-11-03');
    expect(w.text()).not.toContain(fr['warranty.noPurchaseDate']);
  });

  it('purchase date changed, not edited: recomputed; edited: untouched', async () => {
    const w = mountField();
    await w.setProps({ purchaseDate: '2027-01-15' });
    expect(model(w)?.expires).toBe('2029-01-15');
    await dateInput(w).setValue('2031-05-05');
    await w.setProps({ purchaseDate: '2027-03-01' });
    expect(model(w)?.expires).toBe('2031-05-05');
  });

  it('expired warranty: a non-blocking note', () => {
    const w = mountField({ modelValue: legal({ expires: '2020-01-01' }) });
    expect(w.text()).toContain(fr['warranty.expired']);
    expect(w.find('ul[role="alert"]').exists()).toBe(false);
  });
});

describe('WarrantyField: one or several products (011, R7)', () => {
  it('single product: short names, no aria-label override', () => {
    const w = mountField();
    expect(dateInput(w).attributes('aria-label')).toBeUndefined();
    expect(buttonWith(w, fr['warranty.remove']!)!.attributes('aria-label')).toBeUndefined();
  });

  it('several products: accessible names contain the product name', () => {
    const w = mountField({ multi: true, productName: 'Clavier Exemple' });
    expect(dateInput(w).attributes('aria-label')).toBe(sub('warranty.expiresFor', 'Clavier Exemple'));
    expect(lifeBox(w).attributes('aria-label')).toBe(sub('warranty.lifetimeFor', 'Clavier Exemple'));
    expect(details(w).attributes('aria-label')).toBe(sub('warranty.detailsFor', 'Clavier Exemple'));
    expect(w.get('button').attributes('aria-label')).toBe(sub('warranty.removeFor', 'Clavier Exemple'));
  });

  it('several products, empty section: the add button names the product', () => {
    const w = mountField({ multi: true, productName: 'Clavier Exemple', modelValue: null, reason: 'seller' });
    expect(w.get('button').attributes('aria-label')).toBe(sub('warranty.addFor', 'Clavier Exemple'));
  });

  it('two instances in the same screen never share an identifier', () => {
    const props = { modelValue: legal(), reason: null, purchaseDate: '2026-11-03', manualMonths: 24 };
    const Host = defineComponent({ render: () => h('div', [h(WarrantyField, props), h(WarrantyField, props)]) });
    const w = mount(Host, { attachTo: document.body });
    const ids = w.findAll('[id]').map((e) => e.attributes('id'));
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('WarrantyField: keyboard and rendering (011, principle IV)', () => {
  it('every interactive element is a native control, no hover-only action', () => {
    const w = mountField();
    for (const el of w.findAll('button')) expect(el.attributes('type')).toBe('button');
    expect(w.html()).not.toMatch(/tabindex="-1"|onmouseover/);
  });

  it('page data is displayed as text, never as HTML', () => {
    const w = mountField({ modelValue: legal({ origin: 'page', details: '<b>Garantie</b> 3 ans' }) });
    expect((details(w).element as HTMLTextAreaElement).value).toBe('<b>Garantie</b> 3 ans');
    expect(w.find('b').exists()).toBe(false);
  });

  it('a lifetime warranty proposed by the page: box checked, date disabled', () => {
    const w = mountField({
      modelValue: legal({ origin: 'page', lifetime: true, expires: null, details: 'Garantie à vie', durationMonths: null }),
    });
    expect((lifeBox(w).element as HTMLInputElement).checked).toBe(true);
    expect(dateInput(w).attributes('disabled')).toBeDefined();
  });
});

describe('WarrantyField: lifetime and default details (011, review)', () => {
  const neutral = fr['warranty.lifetimeDetails']!;

  it('checking "lifetime" swaps the untouched default details for the neutral text; unchecking restores them', async () => {
    const w = mountField();
    await lifeBox(w).setValue(true);
    expect(model(w)).toMatchObject({ lifetime: true, details: neutral });
    await lifeBox(w).setValue(false);
    expect(model(w)).toMatchObject({ lifetime: false, details: 'Garantie légale de conformité (2 ans)' });
  });

  it('details typed by the user are kept', async () => {
    const w = mountField();
    await details(w).setValue('Ma note');
    await lifeBox(w).setValue(true);
    expect(model(w)?.details).toBe('Ma note');
    await lifeBox(w).setValue(false);
    expect(model(w)?.details).toBe('Ma note');
  });

  it('a user warranty keeps its details', async () => {
    const w = mountField({ modelValue: legal({ origin: 'user', details: '' }) });
    await lifeBox(w).setValue(true);
    expect(model(w)?.details).toBe('');
  });

  it('unchecking keeps details edited since the check', async () => {
    const w = mountField();
    await lifeBox(w).setValue(true);
    await details(w).setValue('Autre');
    await lifeBox(w).setValue(false);
    expect(model(w)?.details).toBe('Autre');
  });
});

describe('WarrantyField: "expired" uses the local date (011, review)', () => {
  afterEach(() => vi.useRealTimers());

  it('at 23:30 local on 15 November 2026 a warranty expiring on the 15th is not expired, one on the 14th is', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 23, 30));
    expect(mountField({ modelValue: legal({ expires: '2026-11-15' }) }).text()).not.toContain(fr['warranty.expired']);
    expect(mountField({ modelValue: legal({ expires: '2026-11-14' }) }).text()).toContain(fr['warranty.expired']);
  });

  it('at 00:30 local on 16 November the 15th is expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 0, 30));
    expect(mountField({ modelValue: legal({ expires: '2026-11-15' }) }).text()).toContain(fr['warranty.expired']);
  });
});
