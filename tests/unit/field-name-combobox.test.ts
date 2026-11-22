import { mount, type VueWrapper } from '@vue/test-utils';
import FieldNameCombobox from '@/ui/components/FieldNameCombobox.vue';
import { loadCatalog } from './i18n-harness';

/** Free-entry combobox of a field name, with suggestions (spec 019, Q-U4, contracts/ui.md §1.2). Fictitious values. */
const fr = loadCatalog('fr');
const OPTIONS = ['Boutique', 'Couleur', 'N° commande', 'Order number', 'Étagère'];
type State = 'idle' | 'loading' | 'ready' | 'error' | 'locked';

function make(
  props: {
    modelValue?: string;
    options?: string[];
    state?: State;
    describedBy?: string;
    invalid?: boolean;
  } = {},
) {
  const w: VueWrapper = mount(FieldNameCombobox, {
    props: {
      modelValue: '',
      label: 'Nom du champ marchand',
      options: OPTIONS,
      state: 'ready' as State,
      ...props,
    },
    attachTo: document.body,
  });
  return w;
}
const input = (w: VueWrapper) => w.get('input');
const optionsShown = (w: VueWrapper) => w.findAll('[role="option"]').map((o) => o.text());
const emitted = (w: VueWrapper) => (w.emitted('update:modelValue') ?? []).map((e) => e[0]);
async function type(w: VueWrapper, text: string) {
  await input(w).setValue(text);
  await w.setProps({ modelValue: text });
}
const key = (w: VueWrapper, k: string) => input(w).trigger('keydown', { key: k });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FieldNameCombobox: ARIA pattern', () => {
  it('labelled input role=combobox with list autocomplete, controls a listbox', async () => {
    const w = make();
    const i = input(w);
    expect(w.get(`label[for="${i.attributes('id')}"]`).text()).toBe('Nom du champ marchand');
    expect(i.attributes('role')).toBe('combobox');
    expect(i.attributes('aria-autocomplete')).toBe('list');
    expect(i.attributes('aria-expanded')).toBe('false');
    const list = w.get('[role="listbox"]');
    expect(i.attributes('aria-controls')).toBe(list.attributes('id'));
    await i.trigger('focus');
    expect(i.attributes('aria-expanded')).toBe('true');
  });

  it('invalid and describedBy are forwarded', () => {
    const w = make({ invalid: true, describedBy: 'help-1' });
    expect(input(w).attributes('aria-invalid')).toBe('true');
    expect(input(w).attributes('aria-describedby')).toBe('help-1');
  });

  it('emits focus and blur', async () => {
    const w = make();
    await input(w).trigger('focus');
    await input(w).trigger('blur');
    expect(w.emitted('focus')).toHaveLength(1);
    expect(w.emitted('blur')).toHaveLength(1);
  });
});

describe('FieldNameCombobox: free entry and filter', () => {
  it('free entry: the typed text is emitted, even absent from the list', async () => {
    const w = make();
    await type(w, 'Nom inconnu');
    expect(emitted(w)).toEqual(['Nom inconnu']);
  });

  it('filter « contains », case and accents ignored', async () => {
    const w = make();
    await input(w).trigger('focus');
    await type(w, 'N°');
    expect(optionsShown(w)).toEqual(['N° commande']);
    await type(w, 'boutique');
    expect(optionsShown(w)).toEqual(['Boutique']);
    await type(w, 'etag');
    expect(optionsShown(w)).toEqual(['Étagère']);
    await type(w, '');
    expect(optionsShown(w)).toEqual(OPTIONS);
  });

  it('at most 50 options shown', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `Champ ${String(i).padStart(2, '0')}`);
    const w = make({ options: many });
    await input(w).trigger('focus');
    expect(optionsShown(w)).toHaveLength(50);
  });

  it('the number of suggestions is announced (aria-live polite); loading announced', async () => {
    const w = make();
    await input(w).trigger('focus');
    await type(w, 'o');
    const live = w.get('[aria-live="polite"]');
    expect(live.text()).toBe(fr['orderFields.suggestionsCount']!.replace('$1', '4'));
    await w.setProps({ state: 'loading' });
    expect(w.get('[aria-live="polite"]').text()).toBe(fr['orderFields.suggestionsLoading']);
  });
});

describe('FieldNameCombobox: keyboard', () => {
  it('↓/↑ move the active option (aria-activedescendant), Enter chooses it', async () => {
    const w = make();
    await input(w).trigger('focus');
    await key(w, 'ArrowDown');
    expect(input(w).attributes('aria-activedescendant')).toBe(
      w.findAll('[role="option"]')[0]!.attributes('id'),
    );
    await key(w, 'ArrowDown');
    await key(w, 'ArrowDown');
    await key(w, 'ArrowUp');
    expect(w.findAll('[role="option"]')[1]!.attributes('aria-selected')).toBe('true');
    await key(w, 'Enter');
    expect(emitted(w)).toEqual(['Couleur']);
    expect(input(w).attributes('aria-expanded')).toBe('false');
  });

  it('Escape closes, then clears at the second press (APG)', async () => {
    const w = make({ modelValue: 'Merchant' });
    await input(w).trigger('focus');
    await key(w, 'Escape');
    expect(input(w).attributes('aria-expanded')).toBe('false');
    expect(emitted(w)).toEqual([]);
    await key(w, 'Escape');
    expect(emitted(w)).toEqual(['']);
  });

  it('Tab leaves without choosing', async () => {
    const w = make();
    await input(w).trigger('focus');
    await key(w, 'ArrowDown');
    await key(w, 'Tab');
    expect(emitted(w)).toEqual([]);
  });

  it('mousedown on an option = choice', async () => {
    const w = make();
    await input(w).trigger('focus');
    await w.findAll('[role="option"]')[2]!.trigger('mousedown');
    expect(emitted(w)).toEqual(['N° commande']);
  });
});

describe('FieldNameCombobox: locked and error states', () => {
  it.each(['locked', 'error', 'idle'] as const)(
    '%s: no list, free entry still possible',
    async (state) => {
      const w = make({ state });
      await input(w).trigger('focus');
      expect(w.findAll('[role="option"]')).toHaveLength(0);
      expect(input(w).attributes('aria-expanded')).toBe('false');
      await type(w, 'Boutique');
      expect(emitted(w)).toEqual(['Boutique']);
    },
  );
});
