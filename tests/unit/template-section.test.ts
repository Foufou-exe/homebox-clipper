import { mount } from '@vue/test-utils';
import type { TemplateDetail, TemplateFieldView } from '@/shared/types';
import TemplateSection from '@/ui/components/TemplateSection.vue';
import { fieldInputFor, type LineTemplate } from '@/ui/popup/drafts';
import { loadCatalog } from './i18n-harness';

/** Values of a template under a product (spec 018, Q-U4, contracts/ui.md §1.4). Fictitious values only. */
const fr = loadCatalog('fr');
const view = (kind: TemplateFieldView['kind'], name: string, over: Partial<TemplateFieldView> = {}): TemplateFieldView => ({
  type: kind === 'unknown' ? 'color' : kind,
  kind,
  name,
  textValue: '',
  numberValue: 0,
  booleanValue: false,
  ...over,
});
const detail = (fields: TemplateFieldView[]): TemplateDetail => ({
  id: 'tpl-1',
  name: 'Livre typé',
  fingerprint: 'a'.repeat(64),
  description: '',
  quantity: null,
  insured: true,
  manufacturer: 'Éditions Exemple',
  modelNumber: 'ED-1',
  lifetimeWarranty: false,
  warrantyDetails: '',
  locationId: null,
  tags: [],
  fields,
});
const FIELDS = [
  view('text', 'Auteur'),
  view('number', 'Pages'),
  view('boolean', 'Lu'),
  view('time', 'Lu le'),
  view('unknown', 'Couleur', { textValue: 'rouge' }),
  view('text', 'Auteur'),
];
const template = (fields = FIELDS): LineTemplate => ({
  id: 'tpl-1',
  state: 'ready',
  detail: detail(fields),
  values: { manufacturer: 'Éditions Exemple', modelNumber: 'ED-1', insured: true, fields: fields.map(fieldInputFor) },
  applied: { description: null, quantity: null, warranty: false, tagKeys: [], location: false },
});
const mountSection = (t = template()) => mount(TemplateSection, { props: { modelValue: t, productName: 'Roman exemple' }, attachTo: document.body });
const last = (w: ReturnType<typeof mountSection>) => (w.emitted('update:modelValue')!.at(-1)![0] as LineTemplate);
const inputFor = (w: ReturnType<typeof mountSection>, label: string, n = 0) => {
  const l = w.findAll('label').filter((x) => x.text() === label)[n]!;
  return w.get(`#${CSS.escape(l.attributes('for')!)}`);
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TemplateSection', () => {
  it('fieldset with its legend; manufacturer, model number (maxlength 255) and insured', () => {
    const w = mountSection();
    expect(w.get('fieldset legend').text()).toBe(fr['templates.sectionLegend']!.replace('$1', 'Livre typé'));
    expect((inputFor(w, fr['templates.manufacturer']!).element as HTMLInputElement).value).toBe('Éditions Exemple');
    expect(inputFor(w, fr['templates.manufacturer']!).attributes('maxlength')).toBe('255');
    expect(inputFor(w, fr['templates.modelNumber']!).attributes('maxlength')).toBe('255');
    expect((inputFor(w, fr['templates.insured']!).element as HTMLInputElement).checked).toBe(true);
  });

  it('fields in the order of the template, labelled by their name; two fields of the same name stay distinct', () => {
    const w = mountSection();
    const labels = w.findAll('.fields label').map((l) => l.text());
    expect(labels).toEqual(['Auteur', 'Pages', 'Lu', 'Lu le', 'Couleur', 'Auteur']);
    expect(inputFor(w, 'Auteur', 0).attributes('id')).not.toBe(inputFor(w, 'Auteur', 1).attributes('id'));
  });

  it('input types: text (maxlength 500), number as text with inputmode numeric, boolean checkbox, date, unknown read-only', () => {
    const w = mountSection();
    expect(inputFor(w, 'Auteur').attributes()).toMatchObject({ type: 'text', maxlength: '500' });
    expect(inputFor(w, 'Pages').attributes()).toMatchObject({ type: 'text', inputmode: 'numeric' });
    expect(inputFor(w, 'Lu').attributes('type')).toBe('checkbox');
    expect(inputFor(w, 'Lu le').attributes('type')).toBe('date');
    const unknown = inputFor(w, 'Couleur');
    expect(unknown.attributes('readonly')).toBeDefined();
    expect((unknown.element as HTMLInputElement).value).toBe('rouge');
    expect(w.text()).toContain(fr['templates.readOnlyType']);
  });

  it.each(['3,5', 'abc', '12345678901234567890'])('number « %s » → notInteger error, alert linked by aria-describedby', async (value) => {
    const w = mountSection();
    await inputFor(w, 'Pages').setValue(value);
    const t = last(w);
    await w.setProps({ modelValue: t });
    const input = inputFor(w, 'Pages');
    expect(t.values.fields[1]!.error).toBe('notInteger');
    expect(input.attributes('aria-invalid')).toBe('true');
    const err = w.get(`#${CSS.escape(input.attributes('aria-describedby')!)}`);
    expect(err.attributes('role')).toBe('alert');
    expect(err.text()).toBe(fr['templates.errors.notInteger']);
  });

  it('number: empty and « -12 » accepted', async () => {
    const w = mountSection();
    await inputFor(w, 'Pages').setValue('-12');
    expect(last(w).values.fields[1]!.error).toBeNull();
    await inputFor(w, 'Pages').setValue('');
    expect(last(w).values.fields[1]!.error).toBeNull();
  });

  it('text over 500 characters → tooLong', async () => {
    const w = mountSection();
    await inputFor(w, 'Auteur').setValue('x'.repeat(501));
    expect(last(w).values.fields[0]!.error).toBe('tooLong');
  });

  it('date out of the bounds of spec 011 → invalidDate; empty accepted (2026-02-30: see template-drafts.test.ts)', async () => {
    const w = mountSection();
    await inputFor(w, 'Lu le').setValue('1800-01-01');
    expect(last(w).values.fields[3]!.error).toBe('invalidDate');
    await inputFor(w, 'Lu le').setValue('');
    expect(last(w).values.fields[3]!.error).toBeNull();
  });

  it('boolean: checked state emitted', async () => {
    const w = mountSection();
    await inputFor(w, 'Lu').setValue(true);
    expect(last(w).values.fields[2]!.checked).toBe(true);
  });

  it('manufacturer, model number, insured edited', async () => {
    const w = mountSection();
    await inputFor(w, fr['templates.manufacturer']!).setValue('Autre');
    expect(last(w).values.manufacturer).toBe('Autre');
    await inputFor(w, fr['templates.insured']!).setValue(false);
    expect(last(w).values.insured).toBe(false);
  });

  it('no custom field: no list of fields; manufacturer, model number and insured still shown (US2-7)', () => {
    const w = mountSection(template([]));
    expect(w.find('.fields').exists()).toBe(false);
    expect(w.findAll('label').map((l) => l.text())).toEqual([fr['templates.manufacturer'], fr['templates.modelNumber'], fr['templates.insured']]);
  });
});
