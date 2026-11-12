<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue';
import { itemUrl } from '@/background/homebox/client';
import { groupByOrder } from '@/background/history/entry';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { send } from '@/shared/messages';
import type { HistoryEntryView, HistoryListView } from '@/shared/types';
import { errorMessage, formatDate, formatDateTime, t, type MessageKey } from '@/ui/i18n';

/**
 * Local import history (spec 012, contracts/ui.md). Read-only towards HomeBox: no request, no re-import.
 * The service worker returns no entry while locked: nothing is kept here between two openings.
 */
const props = withDefaults(defineProps<{ baseUrl: string; variant?: 'popup' | 'options' }>(), { variant: 'popup' });
const emit = defineEmits<{ changed: []; unlock: []; loaded: [view: HistoryListView] }>();

const loading = ref(true);
const loadError = ref(false);
const view = ref<HistoryListView | null>(null);

const root = ref<HTMLElement | null>(null);
const announce = ref('');
const confirming = ref(false);
const clearButton = ref<HTMLButtonElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmId = `history-clear-${useId()}`;

const entries = computed<HistoryEntryView[]>(() => (view.value?.state === 'ready' ? view.value.entries : []));
const groups = computed(() => groupByOrder(entries.value));

async function reload(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await send({ type: 'history/list' });
    if (res?.ok) {
      view.value = res.value;
      emit('loaded', res.value);
    } else {
      view.value = null;
      loadError.value = true;
    }
  } catch {
    view.value = null;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
defineExpose({ reload });

/** The title of the surface (popup view or options card): focus target once the list is empty. */
function focusTitle(): void {
  root.value?.closest('section')?.querySelector<HTMLElement>('h2')?.focus();
}

const deleteButtons = () => [...(root.value?.querySelectorAll<HTMLButtonElement>('button.delete') ?? [])];

/** No confirmation for a single entry (R5.1); the focus moves to the next "Delete", else the previous one. */
async function remove(entry: HistoryEntryView): Promise<void> {
  const index = deleteButtons().findIndex((b) => b.dataset.id === entry.id);
  const res = await send({ type: 'history/delete', id: entry.id });
  if (!res?.ok || view.value?.state !== 'ready') {
    loadError.value = !res?.ok;
    return;
  }
  view.value = { ...view.value, entries: view.value.entries.filter((e) => e.id !== entry.id) };
  announce.value = t('history.deleted');
  emit('changed');
  await nextTick();
  const buttons = deleteButtons();
  const next = buttons[index] ?? buttons[index - 1];
  if (next) next.focus();
  else focusTitle();
}

async function askClear(): Promise<void> {
  confirming.value = true;
  await nextTick();
  // Safe choice first (contracts/ui.md).
  cancelButton.value?.focus();
}

async function cancelClear(): Promise<void> {
  confirming.value = false;
  await nextTick();
  clearButton.value?.focus();
}

async function confirmClear(): Promise<void> {
  const res = await send({ type: 'history/clear' });
  confirming.value = false;
  if (!res?.ok) {
    loadError.value = true;
    return;
  }
  if (view.value?.state === 'ready') view.value = { ...view.value, entries: [] };
  announce.value = t('history.cleared');
  emit('changed');
  await nextTick();
  focusTitle();
}

function storeName(entry: HistoryEntryView): string {
  if (!entry.merchantId) return t('history.manualStore');
  return MERCHANT_CATALOG.find((m) => m.id === entry.merchantId)?.displayName ?? entry.merchantId;
}

const statusKey = (entry: HistoryEntryView) => `history.status.${entry.status}` as MessageKey;
/** "Missing: invoice not sent, photo not sent" — only for a partial import (contracts/ui.md, item 4). */
function missingText(entry: HistoryEntryView): string | null {
  if (entry.status !== 'partial' || entry.missing.length === 0) return null;
  const items = entry.missing.map((m) => t(`history.missing.${m}` as MessageKey));
  return t('history.missingPrefix', [items.join(t('history.listSeparator'))]);
}

const linkable = (entry: HistoryEntryView) => entry.entityId !== null && entry.instance === props.baseUrl;
</script>

<template>
  <div ref="root" class="history">
    <p v-if="loading" class="muted" role="status">{{ t('popup.loading') }}</p>
    <p v-else-if="loadError" class="error" role="alert">{{ t('history.loadError') }}</p>

    <!-- "Clear all": also while locked, it is the way out after a forgotten passphrase (R5.2). -->
    <div v-if="!loading && !loadError && view" class="toolbar">
      <button
        ref="clearButton"
        class="clear-all"
        type="button"
        :disabled="view.state === 'ready' && entries.length === 0"
        @click="askClear"
      >
        {{ t('history.clearAll') }}
      </button>
    </div>
    <div
      v-if="confirming"
      class="confirm-box"
      role="group"
      :aria-labelledby="confirmId"
      @keydown.esc.stop="cancelClear"
    >
      <p :id="confirmId">{{ t('history.clearConfirm') }}</p>
      <button class="confirm" type="button" @click="confirmClear">{{ t('history.clearConfirmYes') }}</button>
      <button ref="cancelButton" class="cancel" type="button" @click="cancelClear">{{ t('history.cancel') }}</button>
    </div>

    <template v-else-if="view?.state === 'locked'">
      <p class="state" role="status">{{ t('history.locked') }}</p>
      <p class="muted">{{ t('history.lockedHint') }}</p>
      <button v-if="variant === 'popup'" class="primary" type="button" @click="emit('unlock')">
        {{ t('history.unlock') }}
      </button>
      <p v-else class="muted">{{ t('history.lockedOptionsHint') }}</p>
    </template>

    <p v-else-if="view?.state === 'unavailable'" class="muted" role="status">{{ t('history.unavailable') }}</p>

    <template v-else-if="view?.state === 'ready'">
      <p v-if="!view.enabled" class="notice" role="status">{{ t('history.disabledNotice') }}</p>
      <p v-else-if="entries.length === 0" class="muted" role="status">{{ t('history.empty') }}</p>

      <ul v-if="entries.length" class="list">
        <li
          v-for="group in groups"
          :key="group.entries[0]!.id"
          :class="group.orderNumber === null ? 'single' : 'group'"
        >
          <h3 v-if="group.orderNumber !== null">
            {{ t('history.orderGroup', [group.orderNumber, storeName(group.entries[0]!)]) }}
          </h3>
          <ul class="entries">
            <li v-for="entry in group.entries" :key="entry.id" class="entry" :data-id="entry.id">
              <div class="head">
                <strong class="name">{{ entry.name }}</strong>
                <span class="badge" :class="`badge-${entry.status}`">{{ t(statusKey(entry)) }}</span>
              </div>
              <p class="meta">
                <span class="store">{{ storeName(entry) }}</span>
                <span>{{ t('history.importedOn', [formatDateTime(entry.importedAt)]) }}</span>
                <span v-if="entry.purchaseDate">{{ t('history.purchasedOn', [formatDate(entry.purchaseDate)]) }}</span>
              </p>
              <p v-if="missingText(entry)" class="missing">{{ missingText(entry) }}</p>
              <p v-if="entry.reason" class="reason">{{ t('history.reason', [errorMessage(entry.reason)]) }}</p>
              <p v-if="entry.interrupted" class="interrupted">{{ t('recovery.interrupted') }}</p>
              <p v-if="entry.resumable" class="resumable">{{ t('history.resumable') }}</p>
              <p class="actions">
                <a
                  v-if="linkable(entry)"
                  :href="itemUrl(baseUrl, entry.entityId!)"
                  target="_blank"
                  rel="noopener"
                  :aria-label="t('history.openItemAria', [entry.name])"
                >{{ t('result.openInHomebox') }}</a>
                <span v-else-if="entry.entityId" class="muted">{{ t('history.otherInstance', [entry.instance]) }}</span>
                <button
                  class="delete"
                  type="button"
                  :data-id="entry.id"
                  :aria-label="t('history.deleteAria', [entry.name])"
                  @click="remove(entry)"
                >
                  {{ t('history.delete') }}
                </button>
              </p>
            </li>
          </ul>
        </li>
      </ul>
    </template>
    <p class="announce" role="status">{{ announce }}</p>
  </div>
</template>

<style scoped>
.history {
  font-size: 13px;
}
.list,
.entries {
  list-style: none;
  margin: 0;
  padding: 0;
}
.group,
.single {
  margin: 0 0 10px;
}
h3 {
  font-size: 13px;
  margin: 8px 0 4px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.entry {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 8px;
  margin: 0 0 6px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.name {
  overflow-wrap: anywhere;
}
.badge {
  flex-shrink: 0;
  border-radius: var(--radius);
  padding: 1px 6px;
  font-size: 12px;
}
.badge-complete {
  background: var(--success-bg);
  color: var(--success-fg);
}
.badge-partial {
  background: var(--warn-bg);
  color: var(--warn-fg);
}
.badge-running {
  background: var(--warn-bg);
  color: var(--warn-fg);
}
.badge-failed {
  background: var(--danger-bg);
  color: var(--danger-fg);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin: 4px 0 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.missing,
.reason,
.interrupted,
.resumable {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.delete {
  margin-left: auto;
  font-size: 12px;
}
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 6px;
}
.confirm-box {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 8px;
  margin: 0 0 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.confirm-box p {
  flex-basis: 100%;
  margin: 0;
}
.announce {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  margin: 0;
}
a {
  color: var(--accent-text);
}
a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.muted {
  color: var(--muted);
}
.state {
  font-weight: 600;
  margin: 0 0 4px;
}
.notice {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: var(--radius);
  padding: 6px 8px;
}
.error {
  color: var(--danger-fg);
}
</style>
