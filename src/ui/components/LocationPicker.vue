<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import type { LocationChoice, LocationOption } from '@/shared/types';
import { t } from '@/ui/i18n';

const props = defineProps<{
  modelValue: LocationChoice | null;
  options: LocationOption[];
  label: string;
  /** Id d'un élément d'aide relié au champ (aria-describedby). */
  describedBy?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: LocationChoice | null] }>();

/*
 * Motif ARIA « combobox avec listbox » (R9), sans dépendance. Ce composant ne fait que choisir parmi les
 * emplacements existants : aucune création, aucun renommage, aucune suppression (FR-019).
 */
const uid = useId();
const inputId = `${uid}-input`;
const listId = `${uid}-list`;
const optionId = (i: number) => `${uid}-option-${i}`;

const open = ref(false);
/** Vrai dès que l'utilisateur saisit : le champ montre alors la recherche au lieu du choix courant. */
const editing = ref(false);
const query = ref('');
const active = ref(-1);

/** Minuscules et sans accents : « etagere » trouve « Étagère ». */
const LIGATURES: Record<string, string> = { 'œ': 'oe', 'æ': 'ae', 'ĳ': 'ij' };
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[œæĳ]/g, (c) => LIGATURES[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const separator = computed(() => t('location.pathSeparator'));
const pathText = (path: string[]) => path.join(separator.value);
const selectedText = computed(() => (props.modelValue ? pathText(props.modelValue.path) : ''));
const inputValue = computed(() => (editing.value ? query.value : selectedText.value));

// Recherche sur le chemin complet : chaque mot saisi doit s'y retrouver (« garage » trouve tout ce qui est dessous).
const entries = computed(() => props.options.map((o) => ({ option: o, text: pathText(o.path), haystack: fold(o.path.join(' ')) })));
const filtered = computed(() => {
  const words = fold(query.value).split(/\s+/).filter(Boolean);
  return entries.value.filter((e) => words.every((w) => e.haystack.includes(w)));
});
/** Vrai si la liste est réellement affichée (ouverte et non vide). */
const visible = computed(() => open.value && filtered.value.length > 0);
const activeId = computed(() => (open.value && active.value >= 0 && active.value < filtered.value.length ? optionId(active.value) : undefined));

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
  // Tout sélectionner : la première frappe remplace le chemin affiché au lieu de s'y ajouter.
  if (selectedText.value) (event.target as HTMLInputElement).select();
  openList();
}
function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  // Premier caractère hors édition : le champ montre encore le choix courant. On n'en garde que le texte tapé.
  const typed = !editing.value && selectedText.value && value.includes(selectedText.value) ? value.replace(selectedText.value, '') : value;
  editing.value = true;
  query.value = typed;
  active.value = filtered.value.length ? 0 : -1;
  openList();
}
function move(delta: 1 | -1) {
  if (!open.value) {
    openList();
    if (!editing.value) query.value = '';
    active.value = filtered.value.length ? 0 : -1;
    return;
  }
  if (!filtered.value.length) return;
  active.value = Math.min(filtered.value.length - 1, Math.max(0, active.value + delta));
}
function choose(index: number) {
  const entry = filtered.value[index];
  if (!entry) return;
  emit('update:modelValue', { id: entry.option.id, path: [...entry.option.path] });
  close();
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    // Entrée ne soumet jamais le formulaire quand la liste est ouverte.
    if (open.value) event.preventDefault();
    if (open.value && active.value >= 0) choose(active.value);
  } else if (event.key === 'Escape') {
    if (open.value) event.stopPropagation();
    close();
  }
}
// L'option active reste visible quand la liste défile (clavier).
watch(active, async (index) => {
  await nextTick();
  document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
});
</script>

<template>
  <div class="location-picker">
    <label :for="inputId">{{ label }}</label>
    <div class="row">
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
        :aria-activedescendant="activeId"
        :placeholder="t('location.placeholder')"
        :disabled="disabled"
        :value="inputValue"
        @focus="onFocus"
        @click="openList"
        @input="onInput"
        @blur="close"
        @keydown="onKeydown"
      />
      <button v-if="modelValue" type="button" class="remove" :disabled="disabled" @click="emit('update:modelValue', null)">
        {{ t('location.remove') }}
      </button>
    </div>
    <ul v-show="visible" :id="listId" class="list" role="listbox" :aria-label="label">
      <li
        v-for="(entry, i) in filtered"
        :id="optionId(i)"
        :key="entry.option.id"
        role="option"
        class="option"
        :class="{ active: i === active }"
        :aria-selected="i === active ? 'true' : 'false'"
        @mousedown.prevent
        @mouseenter="active = i"
        @click="choose(i)"
      >
        {{ entry.text }}
      </li>
    </ul>
    <p v-if="open && filtered.length === 0" class="no-match" role="status">{{ t('location.noMatch') }}</p>
  </div>
</template>

<style scoped>
.location-picker {
  position: relative;
}
.row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.remove {
  flex: none;
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
.no-match {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
