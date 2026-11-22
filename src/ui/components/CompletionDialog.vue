<script setup lang="ts">
import { computed, onMounted, reactive, ref, useId } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import type {
  CompletionCategory,
  CompletionChange,
  CompletionChoice,
  CompletionPreview,
  ImportDraft,
} from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';
import {
  CATEGORY_LABELS,
  COMPLETION_CATEGORIES,
  changeLabel,
  choiceFor,
  keyNames,
} from '@/ui/popup/completion';

/** One product to complete: the item chosen and its preview (or the error of the preview). */
export interface CompletionItem {
  /** Key of the line of the summary. */
  key: string;
  /** Name of the product in the summary. */
  product: string;
  /** Item chosen in the duplicate dialog. */
  entityId: string;
  itemName: string;
  url: string;
  /** Draft as it will be sent (labels and values of the changes). */
  draft: ImportDraft;
  preview: CompletionPreview | null;
  error: ErrorCode | null;
  /** The product has a template / a location in the summary: they do not apply to an existing item (C4). */
  hasTemplate: boolean;
  hasLocation: boolean;
}

/**
 * Confirmation of a completion (spec 021, contracts/ui-completion.md §2): for each product, the item chosen, the exact
 * additions by category (native check boxes, checked when they have changes), what is already set (without its value)
 * and the quantity box (unchecked, R2). Nothing is sent before "Confirm" (FR-006).
 */
const props = defineProps<{ items: CompletionItem[]; instanceName?: string; busy?: boolean }>();
const emit = defineEmits<{ back: []; confirm: [choices: Record<string, CompletionChoice>] }>();

const uid = useId();
const titleId = `${uid}-completion-title`;
const helpId = `${uid}-completion-help`;
const backButton = ref<HTMLButtonElement | null>(null);

const changesOf = (item: CompletionItem, category: CompletionCategory): CompletionChange[] =>
  item.preview?.changes.filter((c) => c.category === category) ?? [];

/** Categories with at least one change are checked by default (C1); the others are disabled. */
const checked = reactive<Record<string, Record<CompletionCategory, boolean>>>(
  Object.fromEntries(
    props.items.map((item) => [
      item.key,
      Object.fromEntries(COMPLETION_CATEGORIES.map((c) => [c, changesOf(item, c).length > 0])),
    ]),
  ) as Record<string, Record<CompletionCategory, boolean>>,
);
/** "Increase the quantity" boxes: unchecked by default (R2). */
const quantity = reactive<Record<string, boolean>>(
  Object.fromEntries(props.items.map((item) => [item.key, false])),
);

/** Already set in HomeBox (documents apart): names only, never the existing values. */
const filledText = (item: CompletionItem): string | null => {
  const keys = item.preview?.filled.filter((k) => !k.startsWith('doc:')) ?? [];
  return keys.length ? t('completion.filled', [keyNames(keys, item.draft)]) : null;
};
const presentText = (item: CompletionItem): string | null => {
  const keys = item.preview?.filled.filter((k) => k.startsWith('doc:')) ?? [];
  return keys.length ? t('completion.present', [keyNames(keys, item.draft)]) : null;
};

/** A failed preview blocks the confirmation until the user goes back and changes the choice. */
const canConfirm = computed(() =>
  props.items.every((item) => item.preview !== null && item.error === null),
);

function confirm() {
  if (!canConfirm.value || props.busy) return;
  const choices: Record<string, CompletionChoice> = {};
  for (const item of props.items) {
    if (!item.preview) return;
    const boxes = checked[item.key];
    const categories = new Set(COMPLETION_CATEGORIES.filter((c) => boxes?.[c] === true));
    choices[item.key] = choiceFor(
      item.preview,
      categories,
      quantity[item.key] === true,
      item.draft,
    );
  }
  emit('confirm', choices);
}

onMounted(() => backButton.value?.focus());
</script>

<template>
  <div
    class="dialog completion-dialog"
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="helpId"
  >
    <h2 :id="titleId" class="title">{{ t('completion.title') }}</h2>
    <p :id="helpId">{{ t('completion.help') }}</p>
    <p v-if="instanceName" class="muted">{{ t('completion.instance', [instanceName]) }}</p>
    <section v-for="item in items" :key="item.key" class="completion-item">
      <h3>{{ item.product }}</h3>
      <p>
        {{ t('completion.target') }}
        <a :href="item.url" target="_blank" rel="noopener">{{
          item.preview?.itemName || item.itemName
        }}</a>
      </p>
      <ErrorBanner v-if="item.error" :code="item.error" />
      <template v-else-if="item.preview">
        <output v-if="item.preview.changes.length === 0" class="muted">{{
          t('completion.nothing')
        }}</output>
        <div v-for="category in COMPLETION_CATEGORIES" :key="category" class="category">
          <label class="pick">
            <input
              v-model="checked[item.key]![category]"
              type="checkbox"
              :data-category="category"
              :disabled="changesOf(item, category).length === 0"
            />
            <span>{{ t(CATEGORY_LABELS[category]) }}</span>
          </label>
          <ul v-if="changesOf(item, category).length">
            <li v-for="change in changesOf(item, category)" :key="change.key">
              {{ changeLabel(change, item.draft) }}
            </li>
          </ul>
        </div>
        <p v-if="filledText(item)" class="muted">{{ filledText(item) }}</p>
        <p v-if="presentText(item)" class="muted">{{ presentText(item) }}</p>
        <label class="pick">
          <input v-model="quantity[item.key]" type="checkbox" data-quantity />
          <span>{{
            t('completion.quantity', [String(item.draft.quantity), String(item.preview.quantity)])
          }}</span>
        </label>
      </template>
      <p v-if="item.hasTemplate" class="muted">{{ t('completion.templateIgnored') }}</p>
      <p v-if="item.hasLocation" class="muted">{{ t('completion.locationIgnored') }}</p>
    </section>
    <div class="actions">
      <button ref="backButton" type="button" @click="emit('back')">
        {{ t('completion.back') }}
      </button>
      <button class="primary" type="button" :disabled="!canConfirm || busy" @click="confirm">
        {{ t('completion.confirm') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dialog {
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 10px 0;
}
.title {
  margin: 0 0 6px;
  font-size: 14px;
}
.dialog p {
  margin: 0 0 6px;
}
.completion-item h3 {
  margin: 8px 0 4px;
  font-size: 13px;
}
.category ul {
  margin: 0 0 6px;
  font-size: 12px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 13px;
}
.pick input {
  width: auto;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
output.muted {
  display: block;
  margin: 4px 0;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
