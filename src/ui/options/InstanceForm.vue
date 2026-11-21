<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { MAX_INSTANCES, MAX_NAME_LENGTH, defaultName } from '@/background/config/instance-store';
import { MIN_PASSPHRASE_LENGTH } from '@/background/config/key-vault';
import { normalizeBaseUrl, originOf } from '@/background/config/url-policy';
import { requestOrigin } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/**
 * Form to add or change a HomeBox instance (spec 016, US2 and US4, contracts/ui.md §2), extracted from the former
 * configuration form, with the display name. The passphrase is asked at EVERY add, even unlocked (user decision): the
 * current one, or a new one with confirmation for a first installation, a legacy key without passphrase, or a new key
 * on the single instance (as before). In the click: local checks, then the origin permission (user gesture, only for
 * a new origin when changing), then `instance/add` or `instance/update`. Names are rendered as text only.
 *
 * `plainIds` (the single-instance page): the fields keep their former ids (`baseUrl`, `apiKey`, `passphrase`…).
 */
const props = withDefaults(
  defineProps<{
    view: ConfigView;
    mode?: 'add' | 'edit';
    /** The instance changed (edit mode). */
    instance?: InstanceView | null;
    autofocus?: boolean;
    plainIds?: boolean;
  }>(),
  { mode: 'add', instance: null, autofocus: false, plainIds: false },
);
const emit = defineEmits<{
  /** Saved (`error`: the connection test failed, the instance is saved anyway). */
  done: [result: { name: string; error: ErrorCode | null }];
  cancel: [];
}>();

const uid = useId();
const PLAIN: Record<string, string> = { name: 'instanceName' };
const id = (field: string) => (props.plainIds ? (PLAIN[field] ?? field) : `${uid}-${field}`);
const editing = computed(() => props.mode === 'edit' && props.instance !== null);
const name = ref(editing.value ? (props.instance?.name ?? '') : '');
const baseUrl = ref(editing.value ? (props.instance?.baseUrl ?? '') : '');
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
const success = ref<string | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

const instances = computed(() => props.view.instances ?? []);
const others = computed(() => instances.value.filter((i) => i.id !== props.instance?.id));
const single = computed(() => instances.value.length <= 1);
/**
 * A passphrase is chosen now: first installation, legacy key without passphrase, or (single instance only, as
 * before spec 016) a new key typed. Otherwise the current passphrase.
 */
const newPassphrase = computed(() => {
  if (props.view.needsPassphrase === true) return true;
  if (!editing.value) return !props.view.configured;
  return single.value && apiKey.value.trim() !== '';
});
/** Edit mode: only the name changed (same address, no key): a rename, without the passphrase. */
const nameOnly = computed(
  () =>
    editing.value &&
    props.view.needsPassphrase !== true &&
    apiKey.value.trim() === '' &&
    name.value.trim() !== (props.instance?.name ?? '') &&
    sameAs(baseUrl.value, props.instance?.baseUrl ?? ''),
);
/**
 * Locked + new key on the single instance (so a new passphrase): the encrypted history cannot be re-sealed and will
 * be erased by the save (R5.5). Said before sending, never silently.
 */
const historyResetWarning = computed(
  () =>
    editing.value &&
    props.view.locked === true &&
    props.view.needsPassphrase !== true &&
    newPassphrase.value &&
    apiKey.value.trim() !== '',
);

/** Refusals that leave nothing saved: the form keeps its input. Any other error comes from the connection test. */
const NOT_SAVED: readonly ErrorCode[] = [
  'INVALID_URL',
  'INSECURE_URL',
  'INSTANCE_LIMIT',
  'INSTANCE_EXISTS',
  'INSTANCE_NOT_FOUND',
  'INSTANCE_NAME_INVALID',
  'INSTANCE_NAME_TAKEN',
  'KEY_UNREADABLE',
  'WEAK_PASSPHRASE',
  'WRONG_PASSPHRASE',
  'PERMISSION_DENIED',
  'NOT_CONFIGURED',
  'BAD_MESSAGE',
];
/** Edit mode: as the former form, the input is also kept after a key refused by HomeBox. */
const KEEP_INPUT: readonly ErrorCode[] = [...NOT_SAVED, 'UNAUTHORIZED'];

onMounted(() => {
  if (props.autofocus) nameInput.value?.focus();
});

// Edit mode: the saved name and address are shown again once the view is refreshed (values only, so that a refresh
// of the same view never overwrites what is being typed).
watch(
  () => [props.instance?.name, props.instance?.baseUrl] as const,
  ([savedName, savedUrl]) => {
    if (!editing.value) return;
    name.value = savedName ?? '';
    baseUrl.value = savedUrl ?? '';
  },
);

function sameAs(a: string, b: string): boolean {
  const x = normalizeBaseUrl(a);
  const y = normalizeBaseUrl(b);
  return x.ok && y.ok && x.value.baseUrl === y.value.baseUrl;
}

function refuse(code: ErrorCode, instance?: string) {
  error.value = code;
  errorName.value = instance;
}

function clear() {
  apiKey.value = '';
  passphrase.value = '';
  confirmation.value = '';
}

async function submit() {
  error.value = null;
  errorName.value = undefined;
  existing.value = null;
  mismatch.value = false;
  success.value = null;
  if (editing.value) return submitEdit();
  const url = normalizeBaseUrl(baseUrl.value);
  if (!url.ok) return refuse(url.error);
  const same = instances.value.find((i) => sameAs(i.baseUrl, url.value.baseUrl));
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
  // Must stay in the click handler, before any await: browsers require a user gesture (Firefox loses it after an await).
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
    clear();
    emit('done', { name: shown, error: res.ok ? null : res.error });
  } catch {
    refuse('BAD_MESSAGE', prefix);
  } finally {
    busy.value = false;
  }
}

/** Edit mode (`instance/update`, then `instance/rename` if the name changed too). */
async function submitEdit() {
  const instance = props.instance;
  if (!instance) return;
  // With a single instance the messages are not prefixed (the page looks as before).
  const prefix = single.value ? undefined : instance.name;
  const url = normalizeBaseUrl(baseUrl.value);
  if (!url.ok) return refuse(url.error, prefix);
  const same = others.value.find((i) => sameAs(i.baseUrl, url.value.baseUrl));
  if (same) {
    existing.value = same.name;
    return;
  }
  const typed = name.value.trim();
  const renamed = typed !== instance.name;
  if (renamed) {
    if (typed === '' || typed.length > MAX_NAME_LENGTH) return refuse('INSTANCE_NAME_INVALID', prefix);
    if (others.value.some((i) => i.name.toLowerCase() === typed.toLowerCase())) return refuse('INSTANCE_NAME_TAKEN', prefix);
  }
  if (nameOnly.value) return rename(typed, prefix);
  const key = apiKey.value.trim();
  if (key !== '' && /\s/.test(key)) return refuse('UNAUTHORIZED', prefix);
  if (passphrase.value.length < MIN_PASSPHRASE_LENGTH) return refuse('WEAK_PASSPHRASE', prefix);
  if (newPassphrase.value && passphrase.value !== confirmation.value) {
    mismatch.value = true;
    return;
  }
  // A new origin only: requested in the click (user gesture); the same origin is already granted.
  if (originOf(instance.baseUrl) !== url.value.origin) {
    const granted = await requestOrigin(url.value.origin).catch(() => false);
    if (!granted) return refuse('PERMISSION_DENIED', prefix);
  }
  busy.value = true;
  try {
    const res = await send({
      type: 'instance/update',
      instanceId: instance.id,
      baseUrl: url.value.baseUrl,
      apiKey: key,
      passphrase: passphrase.value,
      newPassphrase: newPassphrase.value,
    });
    if (!res.ok && KEEP_INPUT.includes(res.error)) return refuse(res.error, prefix);
    clear();
    if (renamed) {
      const named = await send({ type: 'instance/rename', instanceId: instance.id, name: typed });
      if (!named.ok) return refuse(named.error, prefix);
    }
    if (res.ok) success.value = t('options.savedAndConnected');
    else refuse(res.error, prefix);
    emit('done', { name: renamed ? typed : instance.name, error: res.ok ? null : res.error });
  } catch {
    refuse('BAD_MESSAGE', prefix);
  } finally {
    busy.value = false;
  }
}

async function rename(typed: string, prefix: string | undefined) {
  const instance = props.instance;
  if (!instance) return;
  busy.value = true;
  try {
    const res = await send({ type: 'instance/rename', instanceId: instance.id, name: typed });
    if (!res.ok) return refuse(res.error, prefix);
    emit('done', { name: typed, error: null });
  } catch {
    refuse('BAD_MESSAGE', prefix);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form
    :class="editing ? 'instance-edit-form' : 'instance-form'"
    @submit.prevent="submit"
    @keydown.esc="emit('cancel')"
  >
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
      :placeholder="editing ? instance?.maskedKey : 'hb_…'"
      :required="!editing"
      :aria-describedby="id('apiKeyHelp')"
    />
    <p :id="id('apiKeyHelp')" class="help">
      {{ t('options.apiKeyHelp') }}
      <template v-if="editing">{{ t('options.keepKeyHint') }}</template>
    </p>

    <label :for="id('passphrase')">
      {{ newPassphrase ? t('options.passphraseNew') : t('options.passphraseCurrent') }}
    </label>
    <input
      :id="id('passphrase')"
      v-model="passphrase"
      name="passphrase"
      type="password"
      :autocomplete="newPassphrase ? 'new-password' : 'current-password'"
      :required="!nameOnly"
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

    <p v-if="historyResetWarning" class="notice" role="alert">{{ t('options.historyResetNotice') }}</p>
    <p v-if="existing !== null" class="error" role="alert">{{ t('instances.existing', [existing]) }}</p>
    <p v-if="mismatch" class="error" role="alert">{{ t('options.mismatch') }}</p>
    <ErrorBanner v-if="error" :code="error" :instance="errorName" />
    <p v-if="success" class="success" role="status">{{ success }}</p>

    <div class="actions">
      <button class="primary" type="submit" :disabled="busy">
        {{ busy ? t('options.saving') : t('options.saveAndTest') }}
      </button>
      <slot name="actions" :busy="busy" />
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
.notice {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 13px;
}
.success {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
}
</style>
