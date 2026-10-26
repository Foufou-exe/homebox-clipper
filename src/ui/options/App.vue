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
import { THEME_LABELS, saveTheme, themePreference as theme } from '@/ui/theme';

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
 * Nouvelle clé (ou clé migrée de l'ancien format) : on choisit une phrase de passe, avec confirmation.
 * Clé conservée : la phrase de passe actuelle sert à la déchiffrer.
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
  // Doit rester dans le gestionnaire de clic : Chrome exige un geste utilisateur.
  // Une origine non couverte par optional_host_permissions fait lever une exception.
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
      success.value = 'Connexion à HomeBox réussie. Clé API chiffrée et enregistrée.';
      reset();
    } else {
      error.value = result.error;
      // La configuration est enregistrée même si le test échoue (sauf erreurs de saisie).
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
    if (result.ok) success.value = 'Connexion à HomeBox réussie.';
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
  if (!window.confirm('Supprimer la configuration HomeBox (adresse et clé API) de cette extension ?')) return;
  await send({ type: 'config/delete' });
  reset();
  success.value = null;
  error.value = null;
  await refresh();
}
</script>

<template>
  <AppHeader subtitle="Configuration">
    <ThemeToggle />
  </AppHeader>
  <main class="options">
    <section class="card">
      <h1>Instance HomeBox</h1>
      <p class="intro">
        L’extension communique uniquement avec votre instance HomeBox. La clé API est chiffrée avec
        votre phrase de passe et stockée localement dans ce navigateur ; elle n’est jamais envoyée
        ailleurs.
      </p>

      <InstanceBadge v-if="view.configured" :config="view" />

      <p v-if="view.needsPassphrase" class="notice" role="alert">
        Votre clé API était enregistrée en clair par une version précédente. Elle a été retirée du
        disque : définissez une phrase de passe pour la chiffrer, sinon elle sera perdue à la fermeture
        du navigateur.
      </p>

      <div v-if="view.configured && !view.needsPassphrase" class="session">
        <span v-if="view.locked" class="chip">Verrouillée</span>
        <span v-if="view.locked">La clé sera demandée à l’ouverture de l’extension.</span>
        <template v-else>
          <span class="chip">Déverrouillée</span>
          <span>pour cette session du navigateur.</span>
          <button type="button" :disabled="busy" @click="test">Tester la connexion</button>
          <button type="button" :disabled="busy" @click="lock">Verrouiller</button>
        </template>
      </div>

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
          Générez une clé dans HomeBox (Profil → Clés API), idéalement avec une date d’expiration.
          <template v-if="view.configured">Laissez vide pour conserver la clé actuelle.</template>
        </p>

        <label for="passphrase">
          {{ choosingPassphrase ? 'Phrase de passe (nouvelle)' : 'Phrase de passe actuelle' }}
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
          <label for="confirmation">Confirmer la phrase de passe</label>
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
            Au moins {{ MIN_PASSPHRASE_LENGTH }} caractères. Elle chiffre la clé API sur le disque et vous
            sera demandée une fois par session du navigateur. Elle ne peut pas être récupérée : en cas
            d’oubli, supprimez la configuration et recommencez.
          </template>
          <template v-else>Nécessaire pour déchiffrer la clé actuelle.</template>
        </p>

        <p v-if="mismatch" class="error" role="alert">Les deux phrases de passe ne correspondent pas.</p>
        <ErrorBanner v-if="error" :code="error" />
        <p v-if="success" class="success" role="status">{{ success }}</p>

        <div class="actions">
          <button class="primary" type="submit" :disabled="busy">
            {{ busy ? 'Test en cours…' : 'Tester et enregistrer' }}
          </button>
          <button v-if="view.configured" type="button" :disabled="busy" @click="remove">
            Supprimer la configuration
          </button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Apparence</h2>
      <fieldset class="themes">
        <legend class="sr-only">Thème</legend>
        <label v-for="(label, value) in THEME_LABELS" :key="value" class="radio">
          <input v-model="theme" type="radio" name="theme" :value="value" @change="onTheme" />
          {{ label }}
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
