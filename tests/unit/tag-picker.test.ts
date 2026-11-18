import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { tagKey, type TagLine } from '@/shared/tags';
import type { TagOption } from '@/shared/types';
import TagPicker from '@/ui/components/TagPicker.vue';
import { loadCatalog } from './i18n-harness';

/** Tag choice of a product (spec 014, Q-U3, contracts/ui.md « TagPicker.vue »). Fictitious values only. */
const fr = loadCatalog('fr');
const OPTIONS: TagOption[] = [
  { id: 't1', name: 'Amazon' },
  { id: 't2', name: 'Écran' },
  { id: 't3', name: 'Bureau' },
  { id: 't4', name: 'Informatique' },
];
const line = (name: string, over: Partial<TagLine> = {}): TagLine => ({
  key: tagKey(name),
  name,
  id: null,
  origin: 'merchant',
  checked: true,
  ...over,
});

type State = 'loading' | 'ready' | 'unavailable';

/** Mounted with a v-model that follows its own emissions, like the parent does. */
function mountPicker(lines: TagLine[], state: State = 'ready', options: TagOption[] = OPTIONS) {
  const wrapper = mount(TagPicker, {
    props: {
      lines,
      options,
      state,
      productName: 'Disque SSD Exemple 1 To',
      'onUpdate:lines': (v: TagLine[]) => wrapper.setProps({ lines: v }),
    },
    attachTo: document.body,
  });
  return wrapper;
}
type W = ReturnType<typeof mountPicker>;
const boxes = (w: W) => w.findAll('input[type="checkbox"]');
const input = (w: W) => w.get('input[role="combobox"]');
const optionTexts = (w: W) => w.findAll('[role="option"]').map((o) => o.text());
const last = (w: W) => (w.emitted('update:lines')?.at(-1) as [TagLine[]] | undefined)?.[0] ?? [];
const names = (w: W) => w.findAll('li.tag label').map((l) => l.text());
const press = (w: W, key: string) => input(w).trigger('keydown', { key });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TagPicker: proposals (US1-1, US1-2)', () => {
  it('fieldset with the legend « Tags » and the help linked to the group', () => {
    const w = mountPicker([line('Amazon')]);
    expect(w.get('fieldset legend').text()).toBe(fr['tags.title']);
    const help = w.get(`#${w.get('fieldset').attributes('aria-describedby')}`);
    expect(help.text()).toBe(fr['tags.help']);
  });

  it('proposed tags are checked by default', () => {
    const w = mountPicker([line('Amazon'), line('Informatique', { origin: 'rule' })]);
    expect(boxes(w).map((b) => (b.element as HTMLInputElement).checked)).toEqual([true, true]);
  });

  it('uncheck then check again', async () => {
    const w = mountPicker([line('Amazon')]);
    await boxes(w)[0]!.setValue(false);
    expect(last(w)[0]!.checked).toBe(false);
    expect((boxes(w)[0]!.element as HTMLInputElement).checked).toBe(false);
    await boxes(w)[0]!.setValue(true);
    expect(last(w)[0]!.checked).toBe(true);
  });

  it('empty list: « Aucun tag proposé. » and the add field is still available', () => {
    const w = mountPicker([]);
    expect(w.text()).toContain(fr['tags.none']);
    expect(w.find('input[role="combobox"]').exists()).toBe(true);
  });
});

describe('TagPicker: mentions « nouveau » / « non vérifié » (FR-005, FR-011, FR-019)', () => {
  it('ready and absent from the options → « nouveau », linked by aria-describedby', () => {
    const w = mountPicker([line('Amazon', { id: 't1' }), line('Cuisine', { origin: 'user' })]);
    const [amazon, cuisine] = boxes(w);
    expect(amazon!.attributes('aria-describedby')).toBeUndefined();
    const ids = cuisine!.attributes('aria-describedby')!.split(' ');
    const described = ids.map((id) => w.get(`#${id}`).text());
    expect(described).toContain(fr['tags.badge.new']);
    expect(described).toContain(fr['tags.badge.newHelp']);
  });

  it('unavailable → « non vérifié » on every line', () => {
    const w = mountPicker([line('Amazon'), line('Cuisine')], 'unavailable');
    for (const box of boxes(w)) {
      const described = box
        .attributes('aria-describedby')!
        .split(' ')
        .map((id) => w.get(`#${id}`).text());
      expect(described).toContain(fr['tags.badge.unverified']);
      expect(described).toContain(fr['tags.badge.unverifiedHelp']);
    }
    expect(w.text()).not.toContain(fr['tags.badge.new']);
  });

  it('loading → no mention', () => {
    const w = mountPicker([line('Cuisine')], 'loading');
    expect(boxes(w)[0]!.attributes('aria-describedby')).toBeUndefined();
    expect(w.text()).not.toContain(fr['tags.badge.new']);
    expect(w.text()).not.toContain(fr['tags.badge.unverified']);
  });

  it('a tag matched by key (case and accents ignored) is « existing »', () => {
    const w = mountPicker([line('ECRAN')]);
    expect(boxes(w)[0]!.attributes('aria-describedby')).toBeUndefined();
  });
});

describe('TagPicker: adding a tag (US1-3, US1-4, FR-004)', () => {
  it('search « ecran » → option « Écran »', async () => {
    const w = mountPicker([]);
    await input(w).setValue('ecran');
    expect(optionTexts(w)[0]).toBe('Écran');
    expect(input(w).attributes('aria-expanded')).toBe('true');
  });

  it('adding an existing tag: HomeBox name and id, no « nouveau »', async () => {
    const w = mountPicker([line('Amazon', { id: 't1' })]);
    await input(w).setValue('ecran');
    await w.findAll('[role="option"]')[0]!.trigger('click');
    expect(last(w)).toEqual([
      line('Amazon', { id: 't1' }),
      { key: 'ecran', name: 'Écran', id: 't2', origin: 'user', checked: true },
    ]);
    expect(names(w)).toContain('Écran');
    expect(w.text()).not.toContain(fr['tags.badge.new']);
  });

  it('no exact key among the existing tags → option « Ajouter « X » (nouveau) »', async () => {
    const w = mountPicker([]);
    await input(w).setValue('  Cuisine  ');
    expect(optionTexts(w)).toEqual(['Ajouter « Cuisine » (nouveau)']);
    await press(w, 'Enter');
    expect(last(w)).toEqual([
      { key: 'cuisine', name: 'Cuisine', id: null, origin: 'user', checked: true },
    ]);
    expect(w.text()).toContain(fr['tags.badge.new']);
    expect((input(w).element as HTMLInputElement).value).toBe('');
  });

  it('exact key among the existing tags → no creation option', async () => {
    const w = mountPicker([]);
    await input(w).setValue('bureau');
    expect(optionTexts(w)).toEqual(['Bureau']);
  });

  it('every typed word must appear (search with fold), at most 20 options', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: `Étiquette ${i}` }));
    const w = mountPicker([], 'ready', many);
    await input(w).setValue('etiquette');
    expect(optionTexts(w).filter((t) => t.startsWith('Étiquette'))).toHaveLength(20);
  });

  it('adding a key already present re-checks the line, no duplicate', async () => {
    const w = mountPicker([line('Amazon', { id: 't1', checked: false })]);
    await input(w).setValue('AMAZON');
    await press(w, 'Enter');
    expect(last(w)).toEqual([line('Amazon', { id: 't1', checked: true })]);
    expect(boxes(w)).toHaveLength(1);
  });

  it('unavailable: only the creation option; the added tag is « non vérifié »', async () => {
    const w = mountPicker([], 'unavailable', []);
    await input(w).setValue('Écran');
    expect(optionTexts(w)).toEqual(['Ajouter « Écran » (nouveau)']);
    await press(w, 'Enter');
    expect(last(w).map((l) => l.name)).toEqual(['Écran']);
    expect(w.text()).toContain(fr['tags.badge.unverified']);
  });
});

describe('TagPicker: validation (E5)', () => {
  it('empty name → tags.errors.empty in role="alert", nothing added', async () => {
    const w = mountPicker([]);
    await input(w).setValue('   ');
    await press(w, 'Enter');
    expect(w.get('[role="alert"]').text()).toBe(fr['tags.errors.empty']);
    expect(w.emitted('update:lines')).toBeUndefined();
  });

  it('256 bytes → tags.errors.tooLong, nothing added', async () => {
    const w = mountPicker([]);
    await input(w).setValue('é'.repeat(128));
    await press(w, 'Enter');
    expect(w.get('[role="alert"]').text()).toBe(fr['tags.errors.tooLong']);
    expect(w.emitted('update:lines')).toBeUndefined();
  });

  it('51st tag → tags.errors.tooMany shown, the add field disabled, nothing added', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => line(`Tag ${i}`));
    const w = mountPicker(fifty);
    expect(w.text()).toContain(fr['tags.errors.tooMany']);
    expect(input(w).attributes('disabled')).toBeDefined();
    await press(w, 'Enter');
    expect(w.emitted('update:lines')).toBeUndefined();
  });


  it('the error disappears when typing again', async () => {
    const w = mountPicker([]);
    await press(w, 'Enter');
    expect(w.find('[role="alert"]').exists()).toBe(true);
    await input(w).setValue('C');
    expect(w.find('[role="alert"]').exists()).toBe(false);
  });
});

describe('TagPicker: keyboard only (FR-021)', () => {
  it('combobox / listbox roles, aria-controls, accessible name with the product', () => {
    const w = mountPicker([]);
    const box = input(w);
    expect(box.attributes('aria-label')).toBe('Ajouter un tag à « Disque SSD Exemple 1 To »');
    expect(box.attributes('placeholder')).toBe(fr['tags.add.placeholder']);
    expect(box.attributes('aria-expanded')).toBe('false');
    expect(w.get(`#${box.attributes('aria-controls')}`).attributes('role')).toBe('listbox');
  });

  it('arrows move the active option, aria-activedescendant follows, Enter chooses', async () => {
    const w = mountPicker([]);
    await input(w).setValue('a');
    const first = input(w).attributes('aria-activedescendant');
    expect(first).toBeTruthy();
    await press(w, 'ArrowDown');
    const second = input(w).attributes('aria-activedescendant');
    expect(second).not.toBe(first);
    expect(w.get(`#${second}`).attributes('aria-selected')).toBe('true');
    const chosen = w.get(`#${second}`).text();
    await press(w, 'ArrowUp');
    expect(input(w).attributes('aria-activedescendant')).toBe(first);
    await press(w, 'ArrowDown');
    await press(w, 'Enter');
    expect(last(w).map((l) => l.name)).toEqual([chosen]);
  });

  it('Escape closes the list', async () => {
    const w = mountPicker([]);
    await input(w).setValue('a');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    await press(w, 'Escape');
    expect(input(w).attributes('aria-expanded')).toBe('false');
    expect(input(w).attributes('aria-activedescendant')).toBeUndefined();
  });

  it('ArrowDown on a closed field opens the list of existing tags', async () => {
    const w = mountPicker([]);
    await press(w, 'ArrowDown');
    expect(input(w).attributes('aria-expanded')).toBe('true');
    expect(optionTexts(w)).toEqual(['Amazon', 'Écran', 'Bureau', 'Informatique']);
  });
});

describe('TagPicker: no network, no message, no log', () => {
  it('the component source has neither fetch, sendMessage, send( nor console.', () => {
    const src = readFileSync(resolve(__dirname, '../../src/ui/components/TagPicker.vue'), 'utf8');
    expect(src).not.toMatch(/fetch\(|sendMessage|\bsend\(|console\./);
  });
});

describe('TagPicker: « new » then existing (US3-4)', () => {
  it('the mention disappears when the list contains the tag', async () => {
    const w = mountPicker([line('Cuisine', { origin: 'user' })], 'ready', OPTIONS);
    expect(w.text()).toContain(fr['tags.badge.new']);
    await w.setProps({ options: [...OPTIONS, { id: 't9', name: 'Cuisine' }] });
    expect(w.text()).not.toContain(fr['tags.badge.new']);
  });
});

describe('TagPicker: 50 tags reached (review 014, point 2)', () => {
  it('the add field is disabled with the « too many » message; re-checking an existing tag stays possible', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => line(`Tag ${i}`, { checked: i !== 0 }));
    const w = mountPicker(fifty);
    expect(input(w).attributes('disabled')).toBeDefined();
    const note = w.get(`#${input(w).attributes('aria-describedby')}`);
    expect(note.text()).toBe(fr['tags.errors.tooMany']);
    await boxes(w)[0]!.setValue(true);
    expect(last(w)[0]!.checked).toBe(true);
  });

  it('49 tags: the field stays enabled', () => {
    const w = mountPicker(Array.from({ length: 49 }, (_, i) => line(`Tag ${i}`)));
    expect(input(w).attributes('disabled')).toBeUndefined();
  });
});
