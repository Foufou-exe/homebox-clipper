<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import { send } from '@/shared/messages';
import type { HistoryListView } from '@/shared/types';
import HistoryList from '@/ui/components/HistoryList.vue';
import { t } from '@/ui/i18n';

/**
 * "Import history" card of the options page (012, contracts/ui.md): the on/off checkbox, the inline
 * confirmation before turning it off (which erases everything, FR-007), and the list.
 */
defineProps<{ baseUrl: string }>();
const list = ref<InstanceType<typeof HistoryList> | null>(null);
const view = ref<HistoryListView | null>(null);
const confirming = ref(false);
const announce = ref('');
const checkbox = ref<HTMLInputElement | null>(null);
const keepButton = ref<HTMLButtonElement | null>(null);
const ids = { box: `history-enable-${useId()}`, help: `history-help-${useId()}`, confirm: `history-off-${useId()}` };

async function reload(): Promise<void> {
  await list.value?.reload();
}
defineExpose({ reload });

/** Possible entries: unknown while locked or unavailable, so the confirmation is asked then too. */
const mayHaveEntries = () => !(view.value?.state === 'ready' && view.value.entries.length === 0);

async function setEnabled(enabled: boolean): Promise<void> {
  const res = await send({ type: 'history/set-enabled', enabled });
  if (!res?.ok) return;
  if (!enabled) announce.value = t('options.historyDisabled');
  await reload();
}

async function onToggle(event: Event): Promise<void> {
  const box = event.target as HTMLInputElement;
  if (box.checked) {
    announce.value = '';
    await setEnabled(true);
    return;
  }
  if (!mayHaveEntries()) {
    await setEnabled(false);
    return;
  }
  // The checkbox stays checked until the confirmation.
  box.checked = true;
  confirming.value = true;
  await nextTick();
  keepButton.value?.focus();
}

async function keep(): Promise<void> {
  confirming.value = false;
  await nextTick();
  checkbox.value?.focus();
}

async function turnOff(): Promise<void> {
  confirming.value = false;
  await setEnabled(false);
}
</script>

<template>
  <section class="card history-card">
    <h2 tabindex="-1">{{ t('options.historyTitle') }}</h2>
    <label v-if="view" class="toggle" :for="ids.box">
      <input
        :id="ids.box"
        ref="checkbox"
        type="checkbox"
        :checked="view.enabled"
        :aria-describedby="ids.help"
        @change="onToggle"
      />
      {{ t('options.historyEnable') }}
    </label>
    <p :id="ids.help" class="help">{{ t('options.historyHelp') }}</p>
    <div v-if="confirming" class="confirm-box" role="group" :aria-labelledby="ids.confirm" @keydown.esc.stop="keep">
      <p :id="ids.confirm">{{ t('options.historyDisableConfirm') }}</p>
      <button class="confirm" type="button" @click="turnOff">{{ t('options.historyDisableYes') }}</button>
      <button ref="keepButton" class="keep" type="button" @click="keep">{{ t('options.historyKeep') }}</button>
    </div>
    <p class="card-announce" role="status">{{ announce }}</p>
    <HistoryList ref="list" :base-url="baseUrl" variant="options" @loaded="view = $event" />
  </section>
</template>

<style scoped>
.history-card {
  padding: 16px 20px;
}
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
h2:focus {
  outline: none;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 14px;
  margin: 0;
}
.toggle input {
  width: auto;
}
.help {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 8px;
}
.confirm-box {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 0 0 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.confirm-box p {
  flex-basis: 100%;
  margin: 0;
  font-size: 13px;
}
.card-announce:empty {
  padding: 0;
  margin: 0;
}
.card-announce {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: var(--radius);
  padding: 6px 8px;
  font-size: 13px;
}
</style>
