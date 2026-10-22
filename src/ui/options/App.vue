<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { normalizeBaseUrl } from '@/background/config/url-policy';
import { requestOrigin } from '@/platform';
import { ALLOW_HTTP } from '@/shared/env';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';

const view = ref<ConfigView>({ configured: false });
const baseUrl = ref('');
const apiKey = ref('');
const busy = ref(false);
const error = ref<ErrorCode | null>(null);
const success = ref(false);

async function refresh() {
  view.value = await send({ type: 'config/get' });
  baseUrl.value = view.value.baseUrl ?? '';
}

onMounted(refresh);

async function saveAndTest() {
  error.value = null;
  success.value = false;
  const url = normalizeBaseUrl(baseUrl.value, { dev: ALLOW_HTTP });
  if (!url.ok) {
    error.value = url.error;
    return;
  }
  const key = apiKey.value.trim();
  if (key === '' && !view.value.configured) {
    error.value = 'UNAUTHORIZED';
    return;
  }
  // Doit rester dans le gestionnaire de clic : Chrome exige un geste utilisateur.
  // Une origine non couverte par optional_host_permissions fait lever une exception.
  const granted = await requestOrigin(url.value.origin).catch(() => false);
  if (!granted) {
    error.value = 'PERMISSION_DENIED';
    return;
  }
  busy.value = true;
  try {
    const result =
      key === ''
        ? await send({ type: 'config/test' })
        : await send({ type: 'config/save', baseUrl: url.value.baseUrl, apiKey: key });
    if (result.ok) {
      success.value = true;
      apiKey.value = '';
    } else {
      error.value = result.error;
    }
  } finally {
    busy.value = false;
    await refresh();
  }
}

async function remove() {
  if (!window.confirm('Supprimer la configuration HomeBox (adresse et clé API) de cette extension ?')) return;
  await send({ type: 'config/delete' });
  apiKey.value = '';
  success.value = false;
  error.value = null;
  await refresh();
}
</script>

<template>
  <main class="options">
    <h1>Configuration HomeBox</h1>
    <p class="intro">
      L’extension communique uniquement avec votre instance HomeBox. La clé API reste stockée
      localement dans ce navigateur et n’est jamais envoyée ailleurs.
    </p>

    <InstanceBadge v-if="view.configured" :config="view" />

    <form @submit.prevent="saveAndTest">
      <label for="baseUrl">Adresse de l’instance HomeBox</label>
      <input
        id="baseUrl"
        v-model="baseUrl"
        type="url"
        required
        placeholder="https://homebox.example.com"
        autocomplete="url"
      />

      <label for="apiKey">Clé API</label>
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
        Générez une clé dans HomeBox (Profil → Clés API).
        <template v-if="view.configured">Laissez vide pour conserver la clé actuelle.</template>
      </p>

      <ErrorBanner v-if="error" :code="error" />
      <p v-if="success" class="success" role="status">Connexion à HomeBox réussie.</p>

      <div class="actions">
        <button class="primary" type="submit" :disabled="busy">
          {{ busy ? 'Test en cours…' : 'Tester et enregistrer' }}
        </button>
        <button v-if="view.configured" type="button" :disabled="busy" @click="remove">
          Supprimer la configuration
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.options {
  max-width: 520px;
  margin: 32px auto;
  padding: 0 16px;
}
h1 {
  font-size: 20px;
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
.success {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: 6px;
  padding: 8px 10px;
}
</style>
