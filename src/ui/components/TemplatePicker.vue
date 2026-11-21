<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { fold } from '@/shared/fold';
import type { TemplateOption } from '@/shared/types';
import { t } from '@/ui/i18n';

const props = defineProps<{
  /** Templates of the target instance, already sorted by the service worker. */
  options: TemplateOption[];
  /** Chosen template; `null` = « None ». */
  modelValue: string | null;
  /** For the accessible label. */
  productName: string;
  disabled?: boolean;
  /** Id of an element describing the field (aria-describedby). */
  describedBy?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

/*
 * Template of one product (spec 018, contracts/ui.md §1.2): a native select up to 10 templates, beyond that the same
 * ARIA "combobox with listbox" pattern as LocationPicker. « None » always comes first. Text by interpolation only.
 */
const MAX_SELECT = 10;
const DESCRIPTION_MAX = 40;
const uid = useId();
const inputId = `${uid}-input`;
const listId = `${uid}-list`;
const optionId = (i: number) => `${uid}-option-${i}`;

const short = (s: string) => (s.length > DESCRIPTION_MAX ? `${s.slice(0, DESCRIPTION_MAX - 1)}…` : s);
/** Two templates of the same name are told apart by their description, otherwise by a number. */
const labelled = computed(() => {
  const seen = new Map<string, number>();
  return props.options.map((o) => {
    const same = props.options.filter((x) => x.name === o.name).length > 1;
    const n = (seen.get(o.name) ?? 0) + 1;
    seen.set(o.name, n);
    const label = !same ? o.name : o.description ? `${o.name} — ${short(o.description)}` : n === 1 ? o.name : `${o.name} (${n})`;
    return { id: o.id, label };
  });
});
const many = computed(() => props.options.length > MAX_SELECT);
const accessibleLabel = computed(() => t('templates.pickerFor', [props.productName]));

function onSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', value === '' ? null : value);
}

// Combobox (> 10 templates).
const open = ref(false);
const editing = ref(false);
const query = ref('');
const active = ref(-1);
const selectedText = computed(() => labelled.value.find((o) => o.id === props.modelValue)?.label ?? t('templates.none'));
const inputValue = computed(() => (editing.value ? query.value : selectedText.value));
const items = computed(() => {
  const words = fold(query.value).split(/\s+/).filter(Boolean);
  const matching = labelled.value.filter((o) => words.every((w) => fold(o.label).includes(w)));
  return [{ id: null as string | null, label: t('templates.none') }, ...matching];
});
const visible = computed(() => open.value);
const activeId = computed(() => (open.value && active.value >= 0 && active.value < items.value.length ? optionId(active.value) : undefined));

function openList() {
  if (props.disabled) return;
  open.value = true;
}
function close() {
  open.value = false;
  editing.value = false;
  query.value = '';
  active.value = -1;
}
function onFocus(event: FocusEvent) {
  (event.target as HTMLInputElement).select();
  openList();
}
function onInput(event: Event) {
  editing.value = true;
  query.value = (event.target as HTMLInputElement).value;
  active.value = 0;
  openList();
}
function pick(index: number) {
  const item = items.value[index];
  if (!item) return;
  emit('update:modelValue', item.id);
  close();
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) {
      openList();
      active.value = 0;
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    active.value = Math.min(items.value.length - 1, Math.max(0, active.value + delta));
  } else if (event.key === 'Enter') {
    if (open.value) event.preventDefault();
    if (open.value && active.value >= 0) pick(active.value);
  } else if (event.key === 'Escape') {
    if (open.value) event.stopPropagation();
    close();
  }
}
watch(active, async (index) => {
  await nextTick();
  document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
});
</script>

<template>
  <div class="template-picker">
    <label :for="inputId">{{ t('templates.label') }}</label>
    <select
      v-if="!many"
      :id="inputId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :aria-label="accessibleLabel"
      :aria-describedby="describedBy"
      @change="onSelect"
    >
      <option value="">{{ t('templates.none') }}</option>
      <option v-for="o in labelled" :key="o.id" :value="o.id">{{ o.label }}</option>
    </select>
    <template v-else>
      <input
        :id="inputId"
        role="combobox"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-label="accessibleLabel"
        :aria-expanded="visible ? 'true' : 'false'"
        :aria-controls="listId"
        :aria-describedby="describedBy"
        :aria-activedescendant="activeId"
        :disabled="disabled"
        :value="inputValue"
        @focus="onFocus"
        @click="openList"
        @input="onInput"
        @blur="close"
        @keydown="onKeydown"
      />
      <ul v-show="visible" :id="listId" class="list" role="listbox" :aria-label="accessibleLabel">
        <li
          v-for="(item, i) in items"
          :id="optionId(i)"
          :key="item.id ?? ''"
          role="option"
          class="option"
          :class="{ active: i === active }"
          :aria-selected="i === active ? 'true' : 'false'"
          @mousedown.prevent
          @mouseenter="active = i"
          @click="pick(i)"
        >
          {{ item.label }}
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.template-picker {
  position: relative;
  margin: 8px 0 2px;
}
.template-picker label {
  display: block;
  font-size: 13px;
}
.list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.option {
  padding: 5px 8px;
  cursor: pointer;
  color: var(--fg);
  font-size: 13px;
}
.option.active {
  background: var(--accent);
  color: var(--accent-fg);
}
</style>
