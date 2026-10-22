<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { browser } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { isMessage, send } from '@/shared/messages';
import type { ConfigView, ImportDraft, ManualFile, PendingImport } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import ResultView from './ResultView.vue';
import SummaryView from './SummaryView.vue';

type Screen = 'loading' | 'setup' | 'summary' | 'result';

const screen = ref<Screen>('loading');
const view = ref<ConfigView>({ configured: false });
const tabId = ref<number | null>(null);
const pendings = ref<PendingImport[]>([]);
const running = ref(false);
const error = ref<ErrorCode | null>(null);

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
  if (!view.value.configured) {
    screen.value = 'setup';
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId.value = tab?.id ?? null;
  if (tabId.value === null) {
    screen.value = 'summary';
    return;
  }
  // US4-3 : un import incomplet sur cette page est proposé à la reprise.
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
});

onUnmounted(() => browser.runtime.onMessage.removeListener(onProgress));

async function onSubmit({ drafts, manualFiles }: { drafts: ImportDraft[]; manualFiles: ManualFile[] }) {
  if (tabId.value === null) return;
  screen.value = 'result';
  running.value = true;
  error.value = null;
  try {
    const res = await send({ type: 'import/start', tabId: tabId.value, drafts, manualFiles });
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

function openOptions() {
  void browser.runtime.openOptionsPage();
}
</script>

<template>
  <main class="popup">
    <header>
      <h1>homebox-companion</h1>
      <button class="icon" type="button" aria-label="Configuration" title="Configuration" @click="openOptions">⚙</button>
    </header>

    <p v-if="screen === 'loading'" class="muted" role="status">Chargement…</p>

    <section v-else-if="screen === 'setup'">
      <p>Configurez votre instance HomeBox pour commencer.</p>
      <button class="primary" type="button" @click="openOptions">Configurer HomeBox</button>
    </section>

    <SummaryView v-else-if="screen === 'summary' && tabId !== null" :tab-id="tabId" :config="view" @submit="onSubmit" />

    <template v-else-if="screen === 'result'">
      <InstanceBadge :config="view" />
      <ErrorBanner v-if="error" :code="error">
        <button v-if="error === 'UNAUTHORIZED'" type="button" @click="openOptions">Vérifier la configuration</button>
      </ErrorBanner>
      <ResultView
        :pendings="pendings"
        :base-url="view.baseUrl ?? ''"
        :running="running"
        @updated="upsert"
        @abandoned="onAbandoned"
      />
    </template>
  </main>
</template>

<style scoped>
.popup {
  width: 400px;
  max-height: 580px;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h1 {
  font-size: 15px;
  margin: 0 0 6px;
}
.icon {
  border: none;
  font-size: 16px;
  padding: 2px 6px;
}
.muted {
  color: var(--muted);
}
</style>
