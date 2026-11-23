import { mount } from '@vue/test-utils';
import EntityTypePicker from '@/ui/components/EntityTypePicker.vue';
import { loadCatalog } from './i18n-harness';

/** `EntityTypePicker` (spec 023, contracts/ui.md §2): a native select, never a combobox. Fictitious values only. */
const fr = loadCatalog('fr');
const TYPES = [
  { id: 'et-item', name: 'Item' },
  { id: 'et-book', name: 'Livre' },
  { id: 'et-tool', name: 'Outil' },
];
const props = (over: Record<string, unknown> = {}) => ({
  options: TYPES,
  modelValue: 'et-item' as string | null,
  productName: 'Roman exemple',
  defaultId: 'et-item' as string | null,
  ...over,
});

describe('EntityTypePicker', () => {
  it('a native select with an associated label; the options are the types', () => {
    const w = mount(EntityTypePicker, { props: props() });
    const select = w.get('select');
    const label = w.get('label');
    expect(label.attributes('for')).toBe(select.attributes('id'));
    expect(label.text()).toBe(fr['entityType.label']);
    expect(select.attributes('aria-label')).toBe(
      (fr['entityType.pickerFor'] ?? '').replace('$1', 'Roman exemple'),
    );
    const options = w.findAll('option');
    expect(options.map((o) => o.attributes('value'))).toEqual(['et-item', 'et-book', 'et-tool']);
    expect((select.element as HTMLSelectElement).value).toBe('et-item');
  });

  it('never an ARIA combobox or listbox', () => {
    const w = mount(EntityTypePicker, { props: props() });
    expect(w.find('[role="combobox"]').exists()).toBe(false);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.find('input').exists()).toBe(false);
  });

  it('the known server default carries the default suffix', () => {
    const w = mount(EntityTypePicker, { props: props() });
    expect(w.findAll('option')[0]!.text()).toBe(
      (fr['entityType.defaultSuffix'] ?? '').replace('$1', 'Item'),
    );
    expect(w.findAll('option')[1]!.text()).toBe('Livre');
  });

  it('an unknown server default adds a first empty option and selects it for null', () => {
    const w = mount(EntityTypePicker, { props: props({ defaultId: null, modelValue: null }) });
    const options = w.findAll('option');
    expect(options[0]!.attributes('value')).toBe('');
    expect(options[0]!.text()).toBe(fr['entityType.serverDefault']);
    expect(options).toHaveLength(4);
    expect((w.get('select').element as HTMLSelectElement).value).toBe('');
  });

  it('a choice emits the identifier; the empty option emits null', async () => {
    const w = mount(EntityTypePicker, { props: props({ defaultId: null, modelValue: null }) });
    await w.get('select').setValue('et-tool');
    await w.get('select').setValue('');
    expect(w.emitted('update:modelValue')).toEqual([['et-tool'], [null]]);
  });

  it('two types with the same name are numbered; names are plain text (no markup)', () => {
    const w = mount(EntityTypePicker, {
      props: props({
        options: [
          { id: 'a', name: '<b>Outil</b>' },
          { id: 'b', name: '<b>Outil</b>' },
        ],
        modelValue: 'a',
        defaultId: null,
      }),
    });
    const texts = w.findAll('option').map((o) => o.text());
    expect(texts).toEqual([fr['entityType.serverDefault'], '<b>Outil</b>', '<b>Outil</b> (2)']);
    expect(w.find('b').exists()).toBe(false);
  });

  it('disabled disables the select', () => {
    const w = mount(EntityTypePicker, { props: props({ disabled: true }) });
    expect(w.get('select').attributes('disabled')).toBeDefined();
  });
});
