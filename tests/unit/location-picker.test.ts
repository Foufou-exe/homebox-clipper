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
    props: { modelValue: null, options: OPTIONS, label: 'Emplacement pour cette commande', ...props },
  });

type W = ReturnType<typeof mountPicker>;
const input = (w: W) => w.get('input[role="combobox"]');
const optionTexts = (w: W) => w.findAll('[role="option"]').map((o) => o.text());
const type = async (w: W, text: string) => {
  await input(w).setValue(text);
};
const emitted = (w: W) => w.emitted('update:modelValue');

describe('LocationPicker : ARIA combobox + listbox (R9, FR-011, FR-013)', () => {
  it('input role=combobox relié à une listbox, fermé au départ', () => {
    const w = mountPicker();
    const box = input(w);
    expect(box.attributes('aria-expanded')).toBe('false');
    expect(box.attributes('aria-autocomplete')).toBe('list');
    const listId = box.attributes('aria-controls');
    expect(listId).toBeTruthy();
    expect(w.get(`#${listId}`).attributes('role')).toBe('listbox');
    expect(box.attributes('aria-activedescendant')).toBeUndefined();
  });

  it('le libellé est associé à l’input', () => {
    const w = mountPicker();
    const label = w.get('label');
    expect(label.text()).toBe('Emplacement pour cette commande');
    expect(label.attributes('for')).toBe(input(w).attributes('id'));
  });

  it('saisir ouvre la liste ; chaque option montre le chemin complet', async () => {
    const w = mountPicker();
    await type(w, 'a');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    expect(optionTexts(w)).toContain('Maison › Garage › Étagère');
  });

  it('filtre par le chemin complet : « garage » trouve tout ce qui est dessous', async () => {
    const w = mountPicker();
    await type(w, 'garage');
    expect(optionTexts(w)).toEqual(['Maison › Garage', 'Maison › Garage › Étagère']);
  });

  it('insensible à la casse et aux accents : « etagere » trouve « Étagère »', async () => {
    const w = mountPicker();
    await type(w, 'ETAGERE');
    expect(optionTexts(w)).toEqual(['Atelier › Étagère', 'Maison › Garage › Étagère']);
  });

  it('plusieurs mots : tous doivent se retrouver dans le chemin', async () => {
    const w = mountPicker();
    await type(w, 'maison etagere');
    expect(optionTexts(w)).toEqual(['Maison › Garage › Étagère']);
  });

  it('les homonymes se distinguent par leur chemin complet', async () => {
    const w = mountPicker();
    await type(w, 'étagère');
    const texts = optionTexts(w);
    expect(new Set(texts).size).toBe(2);
  });

  it('aucun résultat : message du catalogue, aucune option', async () => {
    const w = mountPicker();
    await type(w, 'zzz');
    expect(optionTexts(w)).toEqual([]);
    expect(w.text()).toContain('Aucun emplacement ne correspond.');
  });

  it('ArrowDown ouvre la liste et active la première option (aria-activedescendant)', async () => {
    const w = mountPicker();
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    expect(input(w).attributes('aria-expanded')).toBe('true');
    const first = w.findAll('[role="option"]')[0]!;
    expect(input(w).attributes('aria-activedescendant')).toBe(first.attributes('id'));
    expect(first.attributes('aria-selected')).toBe('true');
  });

  it('flèches : descendre, remonter, borné aux extrémités', async () => {
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

  it('Entrée choisit l’option active et émet update:modelValue avec id et chemin', async () => {
    const w = mountPicker();
    await type(w, 'etagere');
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toEqual([[{ id: 'e1', path: ['Maison', 'Garage', 'Étagère'] }]]);
    expect(input(w).attributes('aria-expanded')).toBe('false');
  });

  it('Entrée sans option active n’émet rien', async () => {
    const w = mountPicker();
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toBeUndefined();
  });

  it('clavier seul : saisir puis Entrée choisit la première correspondance', async () => {
    const w = mountPicker();
    await type(w, 'atelier');
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toEqual([[{ id: 'a', path: ['Atelier'] }]]);
  });

  it('Échap ferme la liste sans rien choisir', async () => {
    const w = mountPicker();
    await type(w, 'garage');
    await input(w).trigger('keydown', { key: 'Escape' });
    expect(input(w).attributes('aria-expanded')).toBe('false');
    expect(emitted(w)).toBeUndefined();
  });

  it('un clic sur une option la choisit', async () => {
    const w = mountPicker();
    await type(w, 'maison');
    await w.findAll('[role="option"]')[1]!.trigger('click');
    expect(emitted(w)).toEqual([[{ id: 'g', path: ['Maison', 'Garage'] }]]);
  });

  it('la valeur choisie s’affiche dans le champ avec son chemin', () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    expect((input(w).element as HTMLInputElement).value).toBe('Maison › Garage');
  });

  it('bouton « Retirer » quand une valeur est choisie : émet null', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    const remove = w.findAll('button').find((b) => b.text() === 'Retirer');
    expect(remove).toBeDefined();
    await remove!.trigger('click');
    expect(emitted(w)).toEqual([[null]]);
  });

  it('pas de bouton « Retirer » sans valeur', () => {
    expect(mountPicker().findAll('button')).toHaveLength(0);
  });

  it('disabled : champ et bouton désactivés, aucune ouverture', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] }, disabled: true });
    expect(input(w).attributes('disabled')).toBeDefined();
    expect(w.get('button').attributes('disabled')).toBeDefined();
  });

  it('aucune action de création, de renommage ou de suppression d’emplacement (FR-019)', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    await type(w, 'zzz');
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Retirer']);
    expect(w.findAll('input')).toHaveLength(1);
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).not.toMatch(/créer|renommer|supprimer|ajouter/i);
  });
});

describe('LocationPicker : champ prérempli, ouverture, normalisation (revue US2)', () => {
  const PRESET: LocationChoice = { id: 'a', path: ['Atelier'] };
  /** Simule la frappe d'une lettre dans un champ prérempli sans sélection : le navigateur ajoute au texte affiché. */
  const typeAppended = async (w: W, extra: string) => {
    const el = input(w).element as HTMLInputElement;
    el.value = el.value + extra;
    await input(w).trigger('input');
  };

  it('champ prérempli : taper ne cherche que le texte tapé, pas le chemin affiché', async () => {
    const w = mountPicker({ modelValue: PRESET });
    await typeAppended(w, 'gar');
    expect(optionTexts(w)).toEqual(['Maison › Garage', 'Maison › Garage › Étagère']);
    expect((input(w).element as HTMLInputElement).value).toBe('gar');
  });

  it('champ prérempli avec un séparateur dans le choix : la recherche n’est pas cassée', async () => {
    const w = mountPicker({ modelValue: { id: 'g', path: ['Maison', 'Garage'] } });
    await typeAppended(w, 'atel');
    expect(optionTexts(w)).toEqual(['Atelier', 'Atelier › Étagère']);
  });

  it('le focus sélectionne tout le texte du champ prérempli', async () => {
    const w = mountPicker({ modelValue: PRESET });
    const select = vi.spyOn(input(w).element as HTMLInputElement, 'select');
    await input(w).trigger('focus');
    expect(select).toHaveBeenCalled();
  });

  it('le focus ouvre la liste ; le clic aussi après Échap', async () => {
    const w = mountPicker();
    await input(w).trigger('focus');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    expect(w.findAll('[role="option"]')).toHaveLength(OPTIONS.length);
    await input(w).trigger('keydown', { key: 'Escape' });
    expect(input(w).attributes('aria-expanded')).toBe('false');
    await input(w).trigger('click');
    expect(input(w).attributes('aria-expanded')).toBe('true');
  });

  it('aria-expanded reflète la liste réellement visible : faux sans résultat', async () => {
    const w = mountPicker();
    await type(w, 'zzz');
    expect(input(w).attributes('aria-expanded')).toBe('false');
    const none = mountPicker({ options: [] });
    await input(none).trigger('focus');
    expect(input(none).attributes('aria-expanded')).toBe('false');
  });

  it('« oeuvres » trouve « Œuvres » et « ae » trouve « Æ »', async () => {
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

