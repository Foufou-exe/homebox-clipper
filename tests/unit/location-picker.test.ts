import { mount } from '@vue/test-utils';
import type { LocationChoice, LocationOption } from '@/shared/types';
import LocationPicker from '@/ui/components/LocationPicker.vue';

const OPTIONS: LocationOption[] = [
  { id: 'a', name: 'Atelier', path: ['Atelier'] },
  { id: 'e2', name: 'Étagère', path: ['Atelier', 'Étagère'] },
  { id: 'm', name: 'Maison', path: ['Maison'] },
  { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] },
  { id: 'e1', name: 'Étagère', path: ['Maison', 'Garage', 'Étagère'] },
];

const mountPicker = (props: Partial<{ modelValue: LocationChoice | null; options: LocationOption[]; disabled: boolean }> = {}) =>
  mount(LocationPicker, {
    props: { modelValue: null, options: OPTIONS, label: 'Emplacement des produits', ...props },
  });

type W = ReturnType<typeof mountPicker>;
const input = (w: W) => w.get('input[role="combobox"]');
const optionTexts = (w: W) => w.findAll('[role="option"]').map((o) => o.text());
const type = async (w: W, text: string) => {
  await input(w).setValue(text);
};
const emitted = (w: W) => w.emitted('update:modelValue');

describe('LocationPicker : ARIA combobox + listbox (R9, FR-011, FR-013)', () => {
  it('input role=combobox linked to a listbox, closed initially', () => {
    const w = mountPicker();
    const box = input(w);
    expect(box.attributes('aria-expanded')).toBe('false');
    expect(box.attributes('aria-autocomplete')).toBe('list');
    const listId = box.attributes('aria-controls');
    expect(listId).toBeTruthy();
    expect(w.get(`#${listId}`).attributes('role')).toBe('listbox');
    expect(box.attributes('aria-activedescendant')).toBeUndefined();
  });

  it('the label is associated with the input', () => {
    const w = mountPicker();
    const label = w.get('label');
    expect(label.text()).toBe('Emplacement des produits');
    expect(label.attributes('for')).toBe(input(w).attributes('id'));
  });

  it('typing opens the list; each option shows the full path', async () => {
    const w = mountPicker();
    await type(w, 'a');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    expect(optionTexts(w)).toContain('Maison › Garage › Étagère');
  });

  it('filters by the full path: "garage" finds everything beneath it', async () => {
    const w = mountPicker();
    await type(w, 'garage');
    expect(optionTexts(w)).toEqual(['Maison › Garage', 'Maison › Garage › Étagère']);
  });

  it('case- and accent-insensitive: "etagere" finds "Étagère"', async () => {
    const w = mountPicker();
    await type(w, 'ETAGERE');
    expect(optionTexts(w)).toEqual(['Atelier › Étagère', 'Maison › Garage › Étagère']);
  });

  it('several words: all must appear in the path', async () => {
    const w = mountPicker();
    await type(w, 'maison etagere');
    expect(optionTexts(w)).toEqual(['Maison › Garage › Étagère']);
  });

  it('homonyms are distinguished by their full path', async () => {
    const w = mountPicker();
    await type(w, 'étagère');
    const texts = optionTexts(w);
    expect(new Set(texts).size).toBe(2);
  });

  it('no result: catalog message, no option', async () => {
    const w = mountPicker();
    await type(w, 'zzz');
    expect(optionTexts(w)).toEqual([]);
    expect(w.text()).toContain('Aucun emplacement ne correspond.');
  });

  it('ArrowDown opens the list and activates the first option (aria-activedescendant)', async () => {
    const w = mountPicker();
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    expect(input(w).attributes('aria-expanded')).toBe('true');
    const first = w.findAll('[role="option"]')[0]!;
    expect(input(w).attributes('aria-activedescendant')).toBe(first.attributes('id'));
    expect(first.attributes('aria-selected')).toBe('true');
  });

  it('arrows: move down, move up, bounded at the ends', async () => {
    const w = mountPicker();
    await type(w, 'garage');
    const ids = () => w.findAll('[role="option"]').map((o) => o.attributes('id'));
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    expect(input(w).attributes('aria-activedescendant')).toBe(ids()[1]);
    await input(w).trigger('keydown', { key: 'ArrowUp' });
    expect(input(w).attributes('aria-activedescendant')).toBe(ids()[0]);
    await input(w).trigger('keydown', { key: 'ArrowUp' });
    expect(input(w).attributes('aria-activedescendant')).toBe(ids()[0]);
  });

  it('Enter picks the active option and emits update:modelValue with id and path', async () => {
    const w = mountPicker();
    await type(w, 'etagere');
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toEqual([[{ id: 'e1', path: ['Maison', 'Garage', 'Étagère'] }]]);
    expect(input(w).attributes('aria-expanded')).toBe('false');
  });

  it('Enter without an active option emits nothing', async () => {
    const w = mountPicker();
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toBeUndefined();
  });

  it('keyboard only: typing then Enter picks the first match', async () => {
    const w = mountPicker();
    await type(w, 'atelier');
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toEqual([[{ id: 'a', path: ['Atelier'] }]]);
  });

  it('Escape closes the list without picking anything', async () => {
    const w = mountPicker();
    await type(w, 'garage');
    await input(w).trigger('keydown', { key: 'Escape' });
    expect(input(w).attributes('aria-expanded')).toBe('false');
    expect(emitted(w)).toBeUndefined();
  });

  it('clicking an option picks it', async () => {
    const w = mountPicker();
    await type(w, 'maison');
    await w.findAll('[role="option"]')[1]!.trigger('click');
    expect(emitted(w)).toEqual([[{ id: 'g', path: ['Maison', 'Garage'] }]]);
  });

  it('the chosen value is displayed in the field with its path', () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    expect((input(w).element as HTMLInputElement).value).toBe('Maison › Garage');
  });

  it('"Retirer" button when a value is chosen: emits null', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    const remove = w.findAll('button').find((b) => b.text() === 'Retirer');
    expect(remove).toBeDefined();
    await remove!.trigger('click');
    expect(emitted(w)).toEqual([[null]]);
  });

  it('no "Retirer" button without a value', () => {
    expect(mountPicker().findAll('button')).toHaveLength(0);
  });

  it('disabled: field and button disabled, no opening', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] }, disabled: true });
    expect(input(w).attributes('disabled')).toBeDefined();
    expect(w.get('button').attributes('disabled')).toBeDefined();
  });

  it('no action to create, rename or delete a location (FR-019)', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    await type(w, 'zzz');
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Retirer']);
    expect(w.findAll('input')).toHaveLength(1);
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).not.toMatch(/créer|renommer|supprimer|ajouter/i);
  });
});

describe('LocationPicker: prefilled field, opening, normalization (US2 review)', () => {
  const PRESET: LocationChoice = { id: 'a', path: ['Atelier'] };
  /** Simulates typing a letter in a prefilled field with no selection: the browser appends to the displayed text. */
  const typeAppended = async (w: W, extra: string) => {
    const el = input(w).element as HTMLInputElement;
    el.value = el.value + extra;
    await input(w).trigger('input');
  };

  it('prefilled field: typing only searches the typed text, not the displayed path', async () => {
    const w = mountPicker({ modelValue: PRESET });
    await typeAppended(w, 'gar');
    expect(optionTexts(w)).toEqual(['Maison › Garage', 'Maison › Garage › Étagère']);
    expect((input(w).element as HTMLInputElement).value).toBe('gar');
  });

  it('prefilled field with a separator in the choice: the search is not broken', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    await typeAppended(w, 'atel');
    expect(optionTexts(w)).toEqual(['Atelier', 'Atelier › Étagère']);
  });

  it('focus selects all the text of the prefilled field', async () => {
    const w = mountPicker({ modelValue: PRESET });
    const select = vi.spyOn(input(w).element as HTMLInputElement, 'select');
    await input(w).trigger('focus');
    expect(select).toHaveBeenCalled();
  });

  it('focus opens the list; so does a click after Escape', async () => {
    const w = mountPicker();
    await input(w).trigger('focus');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    expect(w.findAll('[role="option"]')).toHaveLength(OPTIONS.length);
    await input(w).trigger('keydown', { key: 'Escape' });
    expect(input(w).attributes('aria-expanded')).toBe('false');
    await input(w).trigger('click');
    expect(input(w).attributes('aria-expanded')).toBe('true');
  });

  it('aria-expanded reflects the list actually visible: false without results', async () => {
    const w = mountPicker();
    await type(w, 'zzz');
    expect(input(w).attributes('aria-expanded')).toBe('false');
    const none = mountPicker({ options: [] });
    await input(none).trigger('focus');
    expect(input(none).attributes('aria-expanded')).toBe('false');
  });

  it('"oeuvres" finds "Œuvres" and "ae" finds "Æ"', async () => {
    const options: LocationOption[] = [
      { id: 'o', name: 'Œuvres', path: ['Œuvres'] },
      { id: 'x', name: 'Cæsar', path: ['Cæsar'] },
    ];
    const w = mountPicker({ options });
    await type(w, 'oeuvres');
    expect(optionTexts(w)).toEqual(['Œuvres']);
    await type(w, 'caesar');
    expect(optionTexts(w)).toEqual(['Cæsar']);
    await type(w, 'ŒUVRES');
    expect(optionTexts(w)).toEqual(['Œuvres']);
  });
});

