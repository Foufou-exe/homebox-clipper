<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue';
import { MAX_INSTANCES, MAX_NAME_LENGTH, defaultName } from '@/background/config/instance-store';
import { MIN_PASSPHRASE_LENGTH } from '@/background/config/key-vault';
import { normalizeBaseUrl } from '@/background/config/url-policy';
import { requestOrigin } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/**
 * Form to add a HomeBox instance (spec 016, US2, contracts/ui.md §2), extracted from the former configuration form
 * with the optional name. The passphrase is asked at EVERY add, even unlocked (user decision): the current one, or a
 * new one with confirmation for a first installation or a legacy key without passphrase. In the click: local checks,
 * then the origin permission (user gesture), then `instance/add`. Names are rendered as text only.
 */
const props = withDefaults(defineProps<{ view: ConfigView; autofocus?: boolean }>(), { autofocus: false });
const emit = defineEmits<{
  /** The instance was saved (`error`: the connection test failed, the instance is saved anyway). */
  done: [result: { name: string; error: ErrorCode | null }];
  cancel: [];
}>();

const uid = useId();
const id = (field: string) => `${uid}-${field}`;
const name = ref('');
const baseUrl = ref('');
const apiKey = ref('');
const passphrase = ref('');
const confirmation = ref('');
const busy = ref(false);
const error = ref<ErrorCode | null>(null);
/** Name of the instance an error concerns (prefix of the message), when known. */
const errorName = ref<string | undefined>(undefined);
/** Address already configured: the existing instance is named (FR-004). */
const existing = ref<string | null>(null);
const mismatch = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);

const instances = computed(() => props.view.instances ?? []);
/** A passphrase is chosen now: first installation, or legacy key without passphrase (vault not created yet). */
const newPassphrase = computed(() => !props.view.configured || props.view.needsPassphrase === true);

/** Refusals that leave nothing saved: the form stays open with its input. Any other error comes from the test. */
const NOT_SAVED: readonly ErrorCode[] = [
  'INVALID_URL',
  'INSECURE_URL',
  'INSTANCE_LIMIT',
  'INSTANCE_EXISTS',
  'INSTANCE_NAME_INVALID',
  'INSTANCE_NAME_TAKEN',
  'WEAK_PASSPHRASE',
  'WRONG_PASSPHRASE',
  'PERMISSION_DENIED',
  'NOT_CONFIGURED',
  'BAD_MESSAGE',
];

onMounted(() => {
  if (props.autofocus) nameInput.value?.focus();
});

function refuse(code: ErrorCode, instance?: string) {
  error.value = code;
  errorName.value = instance;
}

async function submit() {
  error.value = null;
  errorName.value = undefined;
  existing.value = null;
  mismatch.value = false;
  const url = normalizeBaseUrl(baseUrl.value);
  if (!url.ok) return refuse(url.error);
  const same = instances.value.find((i) => {
    const other = normalizeBaseUrl(i.baseUrl);
    return other.ok && other.value.baseUrl === url.value.baseUrl;
  });
  if (same) {
    existing.value = same.name;
    return;
  }
  const taken = instances.value.map((i) => i.name);
  const typed = name.value.trim();
  const shown = typed || defaultName(url.value.baseUrl, taken);
  const prefix = props.view.configured ? shown : undefined;
  if (instances.value.length >= (props.view.maxInstances ?? MAX_INSTANCES)) return refuse('INSTANCE_LIMIT', prefix);
  if (typed.length > MAX_NAME_LENGTH) return refuse('INSTANCE_NAME_INVALID', prefix);
  if (taken.some((n) => n.toLowerCase() === typed.toLowerCase())) return refuse('INSTANCE_NAME_TAKEN', prefix);
  if (apiKey.value.trim() === '' || /\s/.test(apiKey.value.trim())) return refuse('UNAUTHORIZED', prefix);
  if (passphrase.value.length < MIN_PASSPHRASE_LENGTH) return refuse('WEAK_PASSPHRASE', prefix);
  if (newPassphrase.value && passphrase.value !== confirmation.value) {
    mismatch.value = true;
    return;
  }
  // Must stay in the click handler: Chrome requires a user gesture.
  // An origin not covered by optional_host_permissions throws an exception.
  const granted = await requestOrigin(url.value.origin).catch(() => false);
  if (!granted) return refuse('PERMISSION_DENIED', prefix);
  busy.value = true;
  try {
    const res = await send({
      type: 'instance/add',
      baseUrl: url.value.baseUrl,
      apiKey: apiKey.value.trim(),
      name: typed,
      passphrase: passphrase.value,
      newPassphrase: newPassphrase.value,
    });
    if (!res.ok && NOT_SAVED.includes(res.error)) return refuse(res.error, prefix);
    name.value = '';
    baseUrl.value = '';
    apiKey.value = '';
    passphrase.value = '';
    confirmation.value = '';
    emit('done', { name: shown, error: res.ok ? null : res.error });
  } catch {
    refuse('BAD_MESSAGE', prefix);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="instance-form" @submit.prevent="submit" @keydown.esc="emit('cancel')">
    <label :for="id('name')">{{ t('instances.name') }}</label>
    <input
      :id="id('name')"
      ref="nameInput"
      v-model="name"
      name="name"
      type="text"
      :maxlength="MAX_NAME_LENGTH"
      autocomplete="off"
      :aria-describedby="id('nameHelp')"
    />
    <p :id="id('nameHelp')" class="help">{{ t('instances.nameHelp') }}</p>

    <label :for="id('baseUrl')">{{ t('options.baseUrl') }}</label>
    <input
      :id="id('baseUrl')"
      v-model="baseUrl"
      name="baseUrl"
      type="url"
      required
      placeholder="https://homebox.example.com"
      autocomplete="url"
    />

    <label :for="id('apiKey')">{{ t('options.apiKey') }}</label>
    <input
      :id="id('apiKey')"
      v-model="apiKey"
      name="apiKey"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="hb_…"
      required
      :aria-describedby="id('apiKeyHelp')"
    />
    <p :id="id('apiKeyHelp')" class="help">{{ t('options.apiKeyHelp') }}</p>

    <label :for="id('passphrase')">
      {{ newPassphrase ? t('options.passphraseNew') : t('options.passphraseCurrent') }}
    </label>
    <input
      :id="id('passphrase')"
      v-model="passphrase"
      name="passphrase"
      type="password"
      :autocomplete="newPassphrase ? 'new-password' : 'current-password'"
      required
      :minlength="MIN_PASSPHRASE_LENGTH"
      :aria-describedby="id('passphraseHelp')"
    />
    <template v-if="newPassphrase">
      <label :for="id('confirmation')">{{ t('options.passphraseConfirm') }}</label>
      <input
        :id="id('confirmation')"
        v-model="confirmation"
        name="confirmation"
        type="password"
        autocomplete="new-password"
        required
        :aria-invalid="mismatch"
      />
    </template>
    <p :id="id('passphraseHelp')" class="help">
      <template v-if="newPassphrase">{{ t('options.passphraseHelpNew', [String(MIN_PASSPHRASE_LENGTH)]) }}</template>
      <template v-else>{{ t('options.passphraseHelpCurrent') }}</template>
    </p>

    <p v-if="existing !== null" class="error" role="alert">{{ t('instances.existing', [existing]) }}</p>
    <p v-if="mismatch" class="error" role="alert">{{ t('options.mismatch') }}</p>
    <ErrorBanner v-if="error" :code="error" :instance="errorName" />

    <div class="actions">
      <button class="primary" type="submit" :disabled="busy">
        {{ busy ? t('options.saving') : t('options.saveAndTest') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.help {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 0;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
</style>
