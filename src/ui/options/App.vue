<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { originOf } from '@/background/config/url-policy';
import { browser, requestOrigin } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import HistoryCard from './HistoryCard.vue';
import LockCard from './LockCard.vue';
import WarrantyCard from './WarrantyCard.vue';
import TagsCard from './TagsCard.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import { defaultInstance } from '@/ui/instances';
import DefaultTemplateField from './DefaultTemplateField.vue';
import OrderFieldsSettings from './OrderFieldsSettings.vue';
import OrderLinkSettings from './OrderLinkSettings.vue';
import InstanceForm from './InstanceForm.vue';
import InstancesCard from './InstancesCard.vue';
import PassphraseCard from './PassphraseCard.vue';
import ProjectLinks from '@/ui/components/ProjectLinks.vue';
import ThemeToggle from '@/ui/components/ThemeToggle.vue';
import UpdateBanner from '@/ui/components/UpdateBanner.vue';
import { t } from '@/ui/i18n';
import { THEME_VALUES, saveTheme, themeLabel, themePreference as theme } from '@/ui/theme';

const view = ref<ConfigView>({ configured: false });
const busy = ref(false);
const error = ref<ErrorCode | null>(null);
const success = ref<string | null>(null);
const historyCard = ref<InstanceType<typeof HistoryCard> | null>(null);
/**
 * Spec 016: from two instances on, one card per instance (InstancesCard). With a single instance, the page keeps
 * its former form (address, key, passphrase), which changes this instance (`instance/update`), with its name.
 */
const multi = computed(() => (view.value.instances?.length ?? 0) > 1);
const current = computed(() => defaultInstance(view.value));

async function refresh() {
  view.value = await send({ type: 'config/get' });
}

/** 013: the first load is an opening (R3, "every open" lock); the following refreshes stay config/get. */
onMounted(async () => {
  view.value = await send({ type: 'session/open' });
  try {
    browser.runtime.connect({ name: 'ui-presence' });
  } catch {
    // not available: the lock at the next opening stays the guarantee
  }
  document.addEventListener('visibilitychange', onVisibility);
});

onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility));

/**
 * Back to a hidden tab: the displayed state follows an automatic lock that happened meanwhile. Only the view is
 * reloaded; the form keeps what is being typed.
 */
async function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  view.value = await send({ type: 'config/get' });
}

async function onTheme() {
  await saveTheme(theme.value);
}

/** First installation (`instance/add`, new passphrase): same messages as the former form. */
async function onFirstInstance({ error: code }: { name: string; error: ErrorCode | null }) {
  error.value = code;
  success.value = code ? null : t('options.savedAndConnected');
  await refresh();
}

/** Single instance changed (`instance/update`): the form shows its own messages; the view is reloaded. */
async function onSaved() {
  error.value = null;
  success.value = null;
  await refresh();
}

async function onChanged(history?: boolean) {
  await refresh();
  if (history) await historyCard.value?.reload();
}

/** Single instance: the session's test button (`instance/test`). */
async function test() {
  const instance = current.value;
  if (!instance) return;
  error.value = null;
  success.value = null;
  busy.value = true;
  try {
    const result = await send({ type: 'instance/test', instanceId: instance.id });
    if (result.ok) success.value = t('options.connected');
    else error.value = result.error;
  } finally {
    busy.value = false;
    await refresh();
  }
}

/** The origin permission was withdrawn from the browser settings: asked again in the click (user gesture). */
async function requestAccess() {
  const instance = current.value;
  if (!instance) return;
  const granted = await requestOrigin(originOf(instance.baseUrl)).catch(() => false);
  if (granted) error.value = null;
}

async function lock() {
  view.value = await send({ type: 'session/lock' });
  success.value = null;
}

/** Global deletion (every instance), with its own wording from two instances on (US4-9). */
async function remove() {
  if (!window.confirm(multi.value ? t('options.confirmDeleteAll') : t('options.confirmDelete'))) return;
  await send({ type: 'config/delete' });
  success.value = null;
  error.value = null;
  await refresh();
  // The history was erased with the configuration (FR-009).
  await historyCard.value?.reload();
}
</script>

<template>
  <AppHeader :subtitle="t('options.subtitle')">
    <ThemeToggle />
  </AppHeader>
  <main class="options">
    <UpdateBanner />
    <section class="card">
      <h1>{{ multi ? t('options.instancesTitle') : t('options.title') }}</h1>
      <p class="intro">
        {{ t('options.intro') }}
      </p>

      <InstanceBadge v-if="view.configured && !multi && current" :instance="current" />

      <p v-if="view.needsPassphrase" class="notice" role="alert">
        {{ t('options.legacyKeyNotice') }}
      </p>

      <div v-if="view.configured && !view.needsPassphrase" class="session">
        <span v-if="view.locked" class="chip">{{ t('options.locked') }}</span>
        <span v-if="view.locked">{{ t('options.lockedHint') }}</span>
        <template v-else>
          <span class="chip">{{ t('options.unlocked') }}</span>
          <span>{{ t('options.unlockedHint') }}</span>
          <button v-if="!multi" type="button" :disabled="busy" @click="test">{{ t('options.test') }}</button>
          <button type="button" :disabled="busy" @click="lock">{{ t('options.lock') }}</button>
        </template>
      </div>

      <PassphraseCard v-if="view.configured && !view.needsPassphrase" :view="view" @changed="refresh" />

      <ErrorBanner v-if="error" :code="error">
        <button v-if="error === 'PERMISSION_DENIED' && view.configured" type="button" @click="requestAccess">
          {{ t('instances.requestAccess') }}
        </button>
      </ErrorBanner>
      <p v-if="success" class="success" role="status">{{ success }}</p>

      <InstanceForm v-if="!view.configured" :view="view" @done="onFirstInstance" />

      <InstanceForm v-else-if="!multi && current" :view="view" mode="edit" :instance="current" plain-ids @done="onSaved">
        <template #actions="{ busy: saving }">
          <button type="button" :disabled="saving || busy" @click="remove">{{ t('options.deleteConfig') }}</button>
        </template>
      </InstanceForm>
      <!-- Spec 018: default template of the single instance (FR-024). -->
      <DefaultTemplateField
        v-if="view.configured && !multi && current"
        :instance="current"
        :locked="view.locked !== false || view.needsPassphrase === true"
      />
      <!-- Spec 019: order fields setting of the single instance (FR-001). -->
      <OrderFieldsSettings
        v-if="view.configured && !multi && current"
        :instance="current"
        :locked="view.locked !== false || view.needsPassphrase === true"
      />

      <!-- Spec 025: link to the order page, setting of the single instance (FR-001). -->
      <OrderLinkSettings
        v-if="view.configured && !multi && current"
        :instance="current"
        :locked="view.locked !== false || view.needsPassphrase === true"
      />

      <InstancesCard v-if="view.configured" :view="view" @changed="onChanged" />

      <div v-if="multi" class="actions">
        <button type="button" :disabled="busy" @click="remove">{{ t('options.deleteAll') }}</button>
      </div>
    </section>

    <LockCard />

    <HistoryCard ref="historyCard" :instances="view.instances ?? []" />

    <WarrantyCard />

    <TagsCard />

    <section class="card">
      <h2>{{ t('options.appearance') }}</h2>
      <fieldset class="themes">
        <legend class="sr-only">{{ t('theme.legend') }}</legend>
        <label v-for="value in THEME_VALUES" :key="value" class="radio">
          <input v-model="theme" type="radio" name="theme" :value="value" @change="onTheme" />
          {{ themeLabel(value) }}
        </label>
      </fieldset>
    </section>

    <section class="card">
      <h2>{{ t('options.helpTitle') }}</h2>
      <p class="intro">{{ t('options.helpIntro') }}</p>
      <ProjectLinks variant="buttons" />
    </section>
  </main>
</template>

<style scoped>
.options {
  max-width: 560px;
  margin: 24px auto;
  padding: 0 16px;
}
.options .card {
  padding: 16px 20px;
}
h1,
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
.themes {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.radio {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 14px;
  margin: 0;
}
.radio input {
  width: auto;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.intro,
.help {
  color: var(--muted);
  font-size: 13px;
}
.help {
  margin: 4px 0 0;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.session {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0;
  font-size: 13px;
}
.notice {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 13px;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
.success {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
}
</style>
