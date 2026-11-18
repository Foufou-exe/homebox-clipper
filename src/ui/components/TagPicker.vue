<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { fold } from '@/shared/fold';
import {
  MAX_TAGS_PER_PRODUCT,
  findExisting,
  normalizeTagName,
  tagKey,
  tagNameError,
  type TagLine,
  type TagStatus,
} from '@/shared/tags';
import type { TagOption } from '@/shared/types';
import { t } from '@/ui/i18n';

const props = defineProps<{
  lines: TagLine[];
  /** Existing HomeBox tags, provided by the summary (this component sends no message). */
  options: TagOption[];
  state: 'loading' | 'ready' | 'unavailable';
  /** For the accessible labels. */
  productName: string;
}>();
const emit = defineEmits<{ 'update:lines': [value: TagLine[]] }>();

/*
 * Tags of one product (spec 014, contracts/ui.md). Same ARIA "combobox with listbox" pattern as LocationPicker:
 * the keyboard is handled by the input, the options are not focusable.
 */
const MAX_OPTIONS = 20;
const uid = useId();
const helpId = `${uid}-help`;
const inputId = `${uid}-input`;
const listId = `${uid}-list`;
const boxId = (i: number) => `${uid}-tag-${i}`;
const badgeId = (i: number) => `${uid}-badge-${i}`;
const badgeHelpId = (i: number) => `${uid}-badge-help-${i}`;
const optionId = (i: number) => `${uid}-option-${i}`;
const limitId = `${uid}-limit`;
/** 50 tags: no more can be added (the existing lines can still be checked or unchecked). */
const full = computed(() => props.lines.length >= MAX_TAGS_PER_PRODUCT);

const open = ref(false);
/** List opened from the keyboard on an empty field: every existing tag is offered. */
const browsing = ref(false);
const query = ref('');
const active = ref(-1);
const error = ref<'empty' | 'tooLong' | 'tooMany' | null>(null);

const ERROR_KEYS = { empty: 'tags.errors.empty', tooLong: 'tags.errors.tooLong', tooMany: 'tags.errors.tooMany' } as const;
const BADGES = {
  new: { label: 'tags.badge.new', help: 'tags.badge.newHelp' },
  unverified: { label: 'tags.badge.unverified', help: 'tags.badge.unverifiedHelp' },
} as const;

/** `existing`: no mention. Nothing while the list is loading (FR-011). */
function statusOf(line: TagLine): Exclude<TagStatus, 'existing'> | null {
  if (props.state === 'loading') return null;
  if (props.state === 'unavailable') return 'unverified';
  const choice = line.id ? { name: line.name, id: line.id } : { name: line.name };
  return findExisting(choice, props.options) ? null : 'new';
}
const describedBy = (line: TagLine, i: number) => (statusOf(line) ? `${badgeId(i)} ${badgeHelpId(i)}` : undefined);

type Item = { kind: 'existing'; option: TagOption } | { kind: 'create'; name: string };
const items = computed<Item[]>(() => {
  const words = fold(query.value).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return browsing.value ? props.options.slice(0, MAX_OPTIONS).map((option) => ({ kind: 'existing', option })) : [];
  }
  const existing: Item[] = props.options
    .filter((o) => words.every((w) => fold(o.name).includes(w)))
    .slice(0, MAX_OPTIONS)
    .map((option) => ({ kind: 'existing', option }));
  const name = normalizeTagName(query.value);
  const exact = props.options.some((o) => tagKey(o.name) === tagKey(name));
  return exact ? existing : [...existing, { kind: 'create', name }];
});
const visible = computed(() => open.value && items.value.length > 0);
const activeId = computed(() =>
  visible.value && active.value >= 0 && active.value < items.value.length ? optionId(active.value) : undefined,
);

const copy = (l: TagLine): TagLine => ({ ...l });

function toggle(index: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  emit(
    'update:lines',
    props.lines.map((l, i) => (i === index ? { ...l, checked } : copy(l))),
  );
}

function close() {
  open.value = false;
  browsing.value = false;
  active.value = -1;
}

/** Adds a tag, or checks again the line of the same key (FR-004). Returns `false` with a message if refused. */
function add(rawName: string, id: string | null): boolean {
  const name = normalizeTagName(rawName);
  const key = tagKey(name);
  const index = props.lines.findIndex((l) => l.key === key);
  if (index >= 0 && name !== '') {
    error.value = null;
    emit(
      'update:lines',
      props.lines.map((l, i) => (i === index ? { ...l, checked: true, ...(id && !l.id ? { id, name } : {}) } : copy(l))),
    );
    return true;
  }
  const invalid = tagNameError(name);
  if (invalid) {
    error.value = invalid;
    return false;
  }
  if (props.lines.length >= MAX_TAGS_PER_PRODUCT) {
    error.value = 'tooMany';
    return false;
  }
  error.value = null;
  emit('update:lines', [...props.lines.map(copy), { key, name, id, origin: 'user', checked: true }]);
  return true;
}

function choose(index: number) {
  const item = items.value[index];
  if (!item) return;
  const added = item.kind === 'existing' ? add(item.option.name, item.option.id) : add(item.name, null);
  if (added) query.value = '';
  close();
}

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value;
  error.value = null;
  browsing.value = false;
  open.value = true;
  active.value = items.value.length ? 0 : -1;
}

function move(delta: 1 | -1) {
  if (!visible.value) {
    open.value = true;
    browsing.value = true;
    active.value = items.value.length ? 0 : -1;
    return;
  }
  active.value = Math.min(items.value.length - 1, Math.max(0, active.value + delta));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    // Enter never submits anything else: it adds the active option, or validates the typed name.
    event.preventDefault();
    if (visible.value && active.value >= 0) choose(active.value);
    else if (add(query.value, null)) query.value = '';
  } else if (event.key === 'Escape') {
    if (open.value) event.stopPropagation();
    close();
  }
}

// The active option stays visible when the list scrolls (keyboard).
watch(active, async (index) => {
  await nextTick();
  document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
});
</script>

<template>
  <fieldset class="tag-picker" :aria-describedby="helpId">
    <legend>{{ t('tags.title') }}</legend>
    <p :id="helpId" class="help">{{ t('tags.help') }}</p>
    <ul v-if="lines.length" class="tags">
      <li v-for="(line, i) in lines" :key="line.key" class="tag">
        <input
          :id="boxId(i)"
          type="checkbox"
          :checked="line.checked"
          :aria-describedby="describedBy(line, i)"
          @change="toggle(i, $event)"
        />
        <label :for="boxId(i)">{{ line.name }}</label>
        <template v-if="statusOf(line)">
          <span :id="badgeId(i)" class="badge" :class="`badge-${statusOf(line)}`">{{ t(BADGES[statusOf(line)!].label) }}</span>
          <span :id="badgeHelpId(i)" class="visually-hidden">{{ t(BADGES[statusOf(line)!].help) }}</span>
        </template>
      </li>
    </ul>
    <p v-else class="none">{{ t('tags.none') }}</p>

    <div class="add">
      <label :for="inputId" class="add-label">{{ t('tags.add.label') }}</label>
      <input
        :id="inputId"
        role="combobox"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-label="t('tags.add.labelFor', [productName])"
        :aria-expanded="visible ? 'true' : 'false'"
        :aria-controls="listId"
        :aria-activedescendant="activeId"
        :placeholder="t('tags.add.placeholder')"
        :disabled="full"
        :aria-describedby="full ? limitId : undefined"
        :value="query"
        @input="onInput"
        @blur="close"
        @keydown="onKeydown"
      />
      <!-- ARIA combobox pattern (W3C APG): the mousedown on each option is the pointer equivalent only. -->
      <ul v-show="visible" :id="listId" class="list" role="listbox" :aria-label="t('tags.add.label')">
        <li
          v-for="(item, i) in items"
          :id="optionId(i)"
          :key="item.kind === 'existing' ? item.option.id : 'create'"
          role="option"
          class="option"
          :class="{ active: i === active }"
          :aria-selected="i === active ? 'true' : 'false'"
          @mousedown.prevent
          @mouseenter="active = i"
          @click="choose(i)"
        >
          {{ item.kind === 'existing' ? item.option.name : t('tags.add.create', [item.name]) }}
        </li>
      </ul>
      <p v-if="full" :id="limitId" class="limit">{{ t('tags.errors.tooMany') }}</p>
      <p v-if="error && !(full && error === 'tooMany')" class="error" role="alert">{{ t(ERROR_KEYS[error]) }}</p>
    </div>
  </fieldset>
</template>

<style scoped>
.tag-picker {
  position: relative;
  border: none;
  margin: 8px 0 2px;
  padding: 0;
  min-width: 0;
}
legend {
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.help,
.none {
  margin: 2px 0 4px;
  font-size: 12px;
  color: var(--muted);
}
.tags {
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fg);
}
.tag input {
  width: auto;
}
.badge {
  border-radius: var(--radius);
  padding: 0 4px;
  font-size: 11px;
}
.badge-new {
  background: var(--chip-bg);
  color: var(--chip-fg);
}
.badge-unverified {
  background: var(--warn-bg);
  color: var(--warn-fg);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.add-label {
  display: block;
  font-size: 12px;
  color: var(--muted);
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
.limit {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--danger-fg);
}
</style>
