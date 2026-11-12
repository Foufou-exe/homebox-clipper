<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { browser } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { isMessage, send } from '@/shared/messages';
import type { ConfigView, ImportDraft, ManualFile, PendingImport } from '@/shared/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import ProjectLinks from '@/ui/components/ProjectLinks.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import Icon from '@/ui/components/Icon.vue';
import ThemeToggle from '@/ui/components/ThemeToggle.vue';
import { t } from '@/ui/i18n';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import ResultView from './ResultView.vue';
import SummaryView from './SummaryView.vue';
import HistoryView from './HistoryView.vue';
import UnlockView from './UnlockView.vue';

type Screen = 'loading' | 'setup' | 'locked' | 'summary' | 'result';

const screen = ref<Screen>('loading');
const view = ref<ConfigView>({ configured: false });
const tabId = ref<number | null>(null);
const pendings = ref<PendingImport[]>([]);
const running = ref(false);
const error = ref<ErrorCode | null>(null);
/** History view (012): shown next to the current screen, which stays mounted (`v-show`) and keeps its drafts. */
const showHistory = ref(false);
const historyButton = ref<HTMLButtonElement | null>(null);

function upsert(p: PendingImport) {
  const i = pendings.value.findIndex((x) => x.id === p.id);
  if (i >= 0) pendings.value[i] = p;
  else pendings.value.push(p);
}

const onProgress = (raw: unknown) => {
  if (isMessage(raw) && raw.type === 'import/progress' && raw.pending.tabId === tabId.value) {
    upsert(raw.pending);
  }
};

onMounted(async () => {
  browser.runtime.onMessage.addListener(onProgress);
  view.value = await send({ type: 'config/get' });
  await route();
});

async function route() {
  // Migrated key lost or to be encrypted: the configuration must be completed in the options.
  if (!view.value.configured || (view.value.needsPassphrase && view.value.locked)) {
    screen.value = 'setup';
    return;
  }
  if (view.value.locked) {
    screen.value = 'locked';
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId.value = tab?.id ?? null;
  if (tabId.value === null) {
    screen.value = 'summary';
    return;
  }
  // US4-3: an incomplete import on this page is offered for resume.
  const tabUrl = tab?.url ?? '';
  const unfinished = (await send({ type: 'import/pending', tabId: tabId.value })).filter(
    (p) => p.status !== 'success' && (p.pageUrl === null || tabUrl.startsWith(p.pageUrl)),
  );
  if (unfinished.length) {
    pendings.value = unfinished;
    screen.value = 'result';
  } else {
    screen.value = 'summary';
  }
}

async function onUnlocked(next: ConfigView) {
  view.value = next;
  await route();
}

async function lock() {
  view.value = await send({ type: 'session/lock' });
  pendings.value = [];
  screen.value = 'locked';
}

onUnmounted(() => browser.runtime.onMessage.removeListener(onProgress));

async function onSubmit({
  drafts,
  manualFiles,
  orderLocationId,
}: {
  drafts: ImportDraft[];
  manualFiles: ManualFile[];
  orderLocationId: string | null;
}) {
  if (tabId.value === null) return;
  screen.value = 'result';
  running.value = true;
  error.value = null;
  try {
    const res = await send({ type: 'import/start', tabId: tabId.value, drafts, manualFiles, orderLocationId });
    if (res.ok) res.value.forEach(upsert);
    else error.value = res.error;
  } finally {
    running.value = false;
  }
}

function onAbandoned(id: string) {
  pendings.value = pendings.value.filter((p) => p.id !== id);
  if (pendings.value.length === 0) screen.value = 'summary';
}

function openHistory() {
  showHistory.value = true;
}

async function closeHistory() {
  showHistory.value = false;
  await nextTick();
  historyButton.value?.focus();
}

/** "Unlock" from the locked history: back to the existing unlock screen. */
function unlockFromHistory() {
  showHistory.value = false;
  screen.value = 'locked';
}

function openOptions() {
  void browser.runtime.openOptionsPage();
}
</script>

<template>
  <div class="popup">
    <AppHeader>
      <ThemeToggle />
      <button
        v-if="view.configured"
        ref="historyButton"
        class="header-icon"
        type="button"
        :aria-label="t('history.openAria')"
        :title="t('history.openTitle')"
        :aria-pressed="showHistory"
        @click="openHistory"
      >
        <Icon name="history" />
      </button>
      <button
        v-if="view.configured && !view.locked && !view.needsPassphrase"
        class="header-icon"
        type="button"
        :aria-label="t('popup.lockAria')"
        :title="t('popup.lockTitle')"
        @click="lock"
      >
        <Icon name="lock" />
      </button>
      <button
        class="header-icon"
        type="button"
        :aria-label="t('popup.optionsLabel')"
        :title="t('popup.optionsLabel')"
        @click="openOptions"
      >
        <Icon name="settings" />
      </button>
    </AppHeader>

    <main class="content">
      <HistoryView
        v-if="showHistory"
        :base-url="view.baseUrl ?? ''"
        @close="closeHistory"
        @unlock="unlockFromHistory"
      />
      <div v-show="!showHistory">
        <!-- Outside the v-if chain below: the notice must never hide the summary. -->
        <p v-if="view.needsPassphrase && !view.locked && screen !== 'setup'" class="notice" role="alert">
          {{ t('popup.unprotectedPrefix') }}
          <button class="link" type="button" @click="openOptions">{{ t('popup.unprotectedLink') }}</button>.
        </p>

        <p v-if="screen === 'loading'" class="muted" role="status">{{ t('popup.loading') }}</p>

        <section v-else-if="screen === 'setup'" class="card">
          <p v-if="view.needsPassphrase">
            {{ t('popup.setupPassphrase') }}
          </p>
          <p v-else>{{ t('popup.setupConfigure') }}</p>
          <button class="primary" type="button" @click="openOptions">{{ t('popup.configureButton') }}</button>
        </section>

        <UnlockView v-else-if="screen === 'locked'" :config="view" @unlocked="onUnlocked" />

        <SummaryView v-else-if="screen === 'summary' && tabId !== null" :tab-id="tabId" :config="view" @submit="onSubmit" />

        <template v-else-if="screen === 'result'">
          <InstanceBadge :config="view" />
          <ErrorBanner v-if="error" :code="error">
            <button v-if="error === 'UNAUTHORIZED'" type="button" @click="openOptions">{{ t('popup.checkConfiguration') }}</button>
            <button v-if="error === 'LOCKED'" type="button" @click="screen = 'locked'">{{ t('unlock.submit') }}</button>
          </ErrorBanner>
          <ResultView
            :pendings="pendings"
            :base-url="view.baseUrl ?? ''"
            :running="running"
            @updated="upsert"
            @abandoned="onAbandoned"
          />
        </template>
      </div>
    </main>
    <footer class="project-footer">
      <ProjectLinks variant="footer" />
    </footer>
  </div>
</template>

<style scoped>
.popup {
  width: 400px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
}
.project-footer {
  flex-shrink: 0;
  background: var(--bg);
  border-top: 1px solid var(--border);
  padding: 4px 12px;
  font-size: 12px;
  text-align: center;
}
.content {
  overflow-y: auto;
  padding: 8px 12px 12px;
}
.card p {
  margin: 0 0 10px;
}
.muted {
  color: var(--muted);
}
.notice {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: var(--radius);
  padding: 6px 8px;
  font-size: 12px;
}
.link {
  border: none;
  padding: 0;
  background: none;
  color: inherit;
  text-decoration: underline;
  font-size: inherit;
}
</style>
