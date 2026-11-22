<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { fold } from '@/shared/fold';
import { t } from '@/ui/i18n';

/** Options shown at most (the list is already sorted by the service worker). */
const MAX_SHOWN = 50;

const props = defineProps<{
  modelValue: string;
  label: string;
  /** Existing names of the instance (suggestions only, never values). */
  options: readonly string[];
  state: 'idle' | 'loading' | 'ready' | 'error' | 'locked';
  /** Ids of help or error elements linked to the field (aria-describedby). */
  describedBy?: string;
  invalid?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; focus: []; blur: [] }>();

/*
 * W3C APG "combobox with list autocomplete", dependency-free (spec 019, contracts/ui.md §1.2): FREE entry, the value
 * is always the text typed; the list only suggests existing names. Same keyboard technique as `LocationPicker`.
 * Text by interpolation only; nothing is logged.
 */
const uid = useId();
const inputId = `${uid}-input`;
const listId = `${uid}-list`;
const optionId = (i: number) => `${uid}-option-${i}`;

const open = ref(false);
const active = ref(-1);

const filtered = computed(() => {
  if (props.state !== 'ready') return [];
  const query = fold(props.modelValue.trim());
  return props.options.filter((o) => fold(o).includes(query)).slice(0, MAX_SHOWN);
});
/** True if the list is actually displayed (open and non-empty). */
const visible = computed(() => open.value && filtered.value.length > 0);
const activeId = computed(() => (visible.value && active.value >= 0 && active.value < filtered.value.length ? optionId(active.value) : undefined));
const live = computed(() => {
  if (props.state === 'loading' && open.value) return t('orderFields.suggestionsLoading');
  return visible.value ? t('orderFields.suggestionsCount', [String(filtered.value.length)]) : '';
});

function close() {
  open.value = false;
  active.value = -1;
}
function onFocus() {
  open.value = true;
  active.value = -1;
  emit('focus');
}
function onBlur() {
  close();
  emit('blur');
}
function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  open.value = true;
  active.value = -1;
}
function move(delta: 1 | -1) {
  if (!open.value) {
    open.value = true;
    active.value = filtered.value.length ? 0 : -1;
    return;
  }
  if (!filtered.value.length) return;
  active.value = Math.min(filtered.value.length - 1, Math.max(0, active.value + delta));
}
function choose(index: number) {
  const name = filtered.value[index];
  if (name === undefined) return;
  emit('update:modelValue', name);
  close();
}
/** Escape closes the list, then clears the field at the second press (APG). */
function escape(event: KeyboardEvent) {
  if (open.value) {
    event.stopPropagation();
    close();
    return;
  }
  emit('update:modelValue', '');
}
function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
      break;
    case 'Enter':
      // Enter never submits anything while the list is open.
      if (visible.value) event.preventDefault();
      if (visible.value && active.value >= 0) choose(active.value);
      break;
    case 'Escape':
      escape(event);
      break;
    case 'Tab':
      close();
      break;
    default:
      break;
  }
}
// The active option stays visible when the list scrolls (keyboard).
watch(active, async (index) => {
  await nextTick();
  document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
});
</script>

<template>
  <div class="field-name-combobox">
    <label :for="inputId">{{ label }}</label>
    <input
      :id="inputId"
      role="combobox"
      type="text"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      :aria-expanded="visible ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-activedescendant="activeId"
      :value="modelValue"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKeydown"
    />
    <!--
      Options are not focusable; the keyboard is handled by the input (aria-activedescendant). The mousedown on each
      option is the pointer equivalent (it does not take the focus from the input).
    -->
    <ul v-show="visible" :id="listId" class="list" role="listbox" :aria-label="label">
      <li
        v-for="(name, i) in filtered"
        :id="optionId(i)"
        :key="name"
        role="option"
        class="option"
        :class="{ active: i === active }"
        :aria-selected="i === active ? 'true' : 'false'"
        @mousedown.prevent="choose(i)"
        @mouseenter="active = i"
      >
        {{ name }}
      </li>
    </ul>
    <p class="visually-hidden" aria-live="polite">{{ live }}</p>
  </div>
</template>

<style scoped>
.field-name-combobox {
  position: relative;
}
.field-name-combobox label {
  display: block;
  margin-top: 6px;
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
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
