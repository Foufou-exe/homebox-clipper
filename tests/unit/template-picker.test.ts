import { mount } from '@vue/test-utils';
import type { TemplateOption } from '@/shared/types';
import TemplatePicker from '@/ui/components/TemplatePicker.vue';
import { loadCatalog } from './i18n-harness';

/** Template picker of a product (spec 018, Q-U4, contracts/ui.md §1.2). Fictitious values only. */
const fr = loadCatalog('fr');
const opt = (id: string, name: string, description = ''): TemplateOption => ({
  id,
  name,
  description,
});
const FEW = [
  opt('tpl-2', 'Jeu'),
  opt('tpl-1', 'Livre', 'Romans'),
  opt('tpl-3', 'Livre', 'Bandes dessinées et albums illustrés pour la jeunesse'),
];
const MANY = Array.from({ length: 12 }, (_, i) =>
  opt(`tpl-${i}`, i === 5 ? 'Étagère' : `Modèle ${String(i).padStart(2, '0')}`),
);

const mountPicker = (
  options: TemplateOption[],
  modelValue: string | null = null,
  disabled = false,
) =>
  mount(TemplatePicker, {
    props: { options, modelValue, disabled, productName: 'Roman exemple' },
    attachTo: document.body,
  });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TemplatePicker: native select up to 10 templates', () => {
  it('labelled select, « Aucun » first (empty value), then the templates in order', () => {
    const w = mountPicker(FEW);
    const select = w.get('select');
    const label = w.get('label');
    expect(label.attributes('for')).toBe(select.attributes('id'));
    expect(label.text()).toBe(fr['templates.label']);
    expect(select.attributes('aria-label')).toBe(
      fr['templates.pickerFor']!.replace('$1', 'Roman exemple'),
    );
    const options = select.findAll('option');
    expect(options.map((o) => o.attributes('value'))).toEqual(['', 'tpl-2', 'tpl-1', 'tpl-3']);
    expect(options[0]!.text()).toBe(fr['templates.none']);
    expect((select.element as HTMLSelectElement).value).toBe('');
  });

  it('two templates of the same name: « name — description », description cut at 40 characters', () => {
    const texts = mountPicker(FEW)
      .findAll('option')
      .map((o) => o.text());
    expect(texts[1]).toBe('Jeu');
    expect(texts[2]).toBe('Livre — Romans');
    expect(texts[3]).toBe('Livre — Bandes dessinées et albums illustrés po…');
  });

  it('two templates of the same name without description: « name (2) »', () => {
    const texts = mountPicker([opt('a', 'Livre'), opt('b', 'Livre')])
      .findAll('option')
      .map((o) => o.text());
    expect(texts.slice(1)).toEqual(['Livre', 'Livre (2)']);
  });

  it('emits the id, or null for « Aucun »', async () => {
    const w = mountPicker(FEW);
    await w.get('select').setValue('tpl-1');
    await w.get('select').setValue('');
    expect(w.emitted('update:modelValue')).toEqual([['tpl-1'], [null]]);
  });

  it('can be disabled', () => {
    expect(mountPicker(FEW, null, true).get('select').attributes('disabled')).toBeDefined();
  });
});

describe('TemplatePicker: filterable combobox beyond 10 templates', () => {
  it('combobox + listbox; « Aucun » always first; filter ignoring case and accents', async () => {
    const w = mountPicker(MANY);
    const input = w.get('input[role="combobox"]');
    expect(w.find('select').exists()).toBe(false);
    expect(w.get('label').attributes('for')).toBe(input.attributes('id'));
    await input.trigger('focus');
    expect(w.findAll('[role="option"]').length).toBe(13);
    expect(w.findAll('[role="option"]')[0]!.text()).toBe(fr['templates.none']);
    await input.setValue('etagere');
    const shown = w.findAll('[role="option"]').map((o) => o.text());
    expect(shown).toEqual([fr['templates.none'], 'Étagère']);
  });

  it('keyboard only: arrows, Enter selects, Escape closes', async () => {
    const w = mountPicker(MANY);
    const input = w.get('input[role="combobox"]');
    await input.trigger('focus');
    await input.setValue('etag');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(input.attributes('aria-activedescendant')).toBeTruthy();
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('update:modelValue')).toEqual([['tpl-5']]);
    await input.trigger('focus');
    await input.trigger('keydown', { key: 'Escape' });
    expect(input.attributes('aria-expanded')).toBe('false');
  });

  it('shows the current choice and disables the field', () => {
    const w = mountPicker(MANY, 'tpl-5', true);
    const input = w.get('input[role="combobox"]');
    expect((input.element as HTMLInputElement).value).toBe('Étagère');
    expect(input.attributes('disabled')).toBeDefined();
  });
});
