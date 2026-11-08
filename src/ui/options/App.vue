<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MIN_PASSPHRASE_LENGTH } from '@/background/config/key-vault';
import { normalizeBaseUrl } from '@/background/config/url-policy';
import { requestOrigin } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import ThemeToggle from '@/ui/components/ThemeToggle.vue';
import { t } from '@/ui/i18n';
import { THEME_VALUES, saveTheme, themeLabel, themePreference as theme } from '@/ui/theme';

const view = ref<ConfigView>({ configured: false });
const baseUrl = ref('');
const apiKey = ref('');
const passphrase = ref('');
const confirmation = ref('');
const busy = ref(false);
const error = ref<ErrorCode | null>(null);
const mismatch = ref(false);
const success = ref<string | null>(null);

/**
 * New key (or key migrated from the old format): a passphrase is chosen, with confirmation.
 * Kept key: the current passphrase is used to decrypt it.
 */
const choosingPassphrase = computed(
  () => !view.value.configured || apiKey.value.trim() !== '' || view.value.needsPassphrase === true,
);

async function refresh() {
  view.value = await send({ type: 'config/get' });
  baseUrl.value = view.value.baseUrl ?? '';
}

onMounted(refresh);

async function onTheme() {
  await saveTheme(theme.value);
}

function reset() {
  apiKey.value = '';
  passphrase.value = '';
  confirmation.value = '';
}

async function saveAndTest() {
  error.value = null;
  mismatch.value = false;
  success.value = null;
  const url = normalizeBaseUrl(baseUrl.value);
  if (!url.ok) {
    error.value = url.error;
    return;
  }
  if (!view.value.configured && apiKey.value.trim() === '') {
    error.value = 'UNAUTHORIZED';
    return;
  }
  if (passphrase.value.length < MIN_PASSPHRASE_LENGTH) {
    error.value = 'WEAK_PASSPHRASE';
    return;
  }
  if (choosingPassphrase.value && passphrase.value !== confirmation.value) {
    mismatch.value = true;
    return;
  }
  // Must stay in the click handler: Chrome requires a user gesture.
  // An origin not covered by optional_host_permissions throws an exception.
  const granted = await requestOrigin(url.value.origin).catch(() => false);
  if (!granted) {
    error.value = 'PERMISSION_DENIED';
    return;
  }
  busy.value = true;
  try {
    const result = await send({
      type: 'config/save',
      baseUrl: url.value.baseUrl,
      apiKey: apiKey.value.trim(),
      passphrase: passphrase.value,
    });
    if (result.ok) {
      success.value = t('options.savedAndConnected');
      reset();
    } else {
      error.value = result.error;
      // The configuration is saved even if the test fails (except input errors).
      if (!['WRONG_PASSPHRASE', 'WEAK_PASSPHRASE', 'UNAUTHORIZED', 'PERMISSION_DENIED'].includes(result.error)) reset();
    }
  } finally {
    busy.value = false;
    await refresh();
  }
}

async function test() {
  error.value = null;
  success.value = null;
  busy.value = true;
  try {
    const result = await send({ type: 'config/test' });
    if (result.ok) success.value = t('options.connected');
    else error.value = result.error;
  } finally {
    busy.value = false;
    await refresh();
  }
}

async function lock() {
  view.value = await send({ type: 'session/lock' });
  success.value = null;
}

async function remove() {
  if (!window.confirm(t('options.confirmDelete'))) return;
  await send({ type: 'config/delete' });
  reset();
  success.value = null;
  error.value = null;
  await refresh();
}
</script>

<template>
  <AppHeader :subtitle="t('options.subtitle')">
    <ThemeToggle />
  </AppHeader>
  <main class="options">
    <section class="card">
      <h1>{{ t('options.title') }}</h1>
      <p class="intro">
        {{ t('options.intro') }}
      </p>

      <InstanceBadge v-if="view.configured" :config="view" />

      <p v-if="view.needsPassphrase" class="notice" role="alert">
        {{ t('options.legacyKeyNotice') }}
      </p>

      <div v-if="view.configured && !view.needsPassphrase" class="session">
        <span v-if="view.locked" class="chip">{{ t('options.locked') }}</span>
        <span v-if="view.locked">{{ t('options.lockedHint') }}</span>
        <template v-else>
          <span class="chip">{{ t('options.unlocked') }}</span>
          <span>{{ t('options.unlockedHint') }}</span>
          <button type="button" :disabled="busy" @click="test">{{ t('options.test') }}</button>
          <button type="button" :disabled="busy" @click="lock">{{ t('options.lock') }}</button>
        </template>
      </div>

      <form @submit.prevent="saveAndTest">
        <label for="baseUrl">{{ t('options.baseUrl') }}</label>
        <input
          id="baseUrl"
          v-model="baseUrl"
          type="url"
          required
          placeholder="https://homebox.example.com"
          autocomplete="url"
        />

        <label for="apiKey">{{ t('options.apiKey') }}</label>
        <input
          id="apiKey"
          v-model="apiKey"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :placeholder="view.maskedKey ?? 'hb_…'"
          :required="!view.configured"
          aria-describedby="apiKeyHelp"
        />
        <p id="apiKeyHelp" class="help">
          {{ t('options.apiKeyHelp') }}
          <template v-if="view.configured">{{ t('options.keepKeyHint') }}</template>
        </p>

        <label for="passphrase">
          {{ choosingPassphrase ? t('options.passphraseNew') : t('options.passphraseCurrent') }}
        </label>
        <input
          id="passphrase"
          v-model="passphrase"
          type="password"
          autocomplete="new-password"
          required
          :minlength="MIN_PASSPHRASE_LENGTH"
          aria-describedby="passphraseHelp"
        />
        <template v-if="choosingPassphrase">
          <label for="confirmation">{{ t('options.passphraseConfirm') }}</label>
          <input
            id="confirmation"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="mismatch"
          />
        </template>
        <p id="passphraseHelp" class="help">
          <template v-if="choosingPassphrase">
            {{ t('options.passphraseHelpNew', [String(MIN_PASSPHRASE_LENGTH)]) }}
          </template>
          <template v-else>{{ t('options.passphraseHelpCurrent') }}</template>
        </p>

        <p v-if="mismatch" class="error" role="alert">{{ t('options.mismatch') }}</p>
        <ErrorBanner v-if="error" :code="error" />
        <p v-if="success" class="success" role="status">{{ success }}</p>

        <div class="actions">
          <button class="primary" type="submit" :disabled="busy">
            {{ busy ? t('options.saving') : t('options.saveAndTest') }}
          </button>
          <button v-if="view.configured" type="button" :disabled="busy" @click="remove">
            {{ t('options.deleteConfig') }}
          </button>
        </div>
      </form>
    </section>

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
