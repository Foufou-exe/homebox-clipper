<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import { MIN_PASSPHRASE_LENGTH } from '@/background/config/key-vault';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/**
 * « Change the passphrase » (spec 016, US5-3, contracts/ui.md §2): one passphrase protects every key; the current one,
 * the new one and its confirmation. The service worker re-encrypts everything at once (FR-023). Keys that could not
 * be read are listed by NAME. Never logs, never keeps a passphrase after sending.
 */
const props = defineProps<{ view: ConfigView }>();
const emit = defineEmits<{ changed: [] }>();

const uid = useId();
const id = (field: string) => `${uid}-${field}`;
const open = ref(false);
const current = ref('');
const next = ref('');
const confirm = ref('');
const busy = ref(false);
const error = ref<ErrorCode | null>(null);
const mismatch = ref(false);
const status = ref('');
const toggleButton = ref<HTMLButtonElement | null>(null);
const currentInput = ref<HTMLInputElement | null>(null);

function clear() {
  current.value = '';
  next.value = '';
  confirm.value = '';
}

async function toggle() {
  open.value = !open.value;
  error.value = null;
  mismatch.value = false;
  if (open.value) {
    status.value = '';
    await nextTick();
    currentInput.value?.focus();
  } else clear();
}

async function submit() {
  error.value = null;
  mismatch.value = false;
  if (next.value.length < MIN_PASSPHRASE_LENGTH) {
    error.value = 'WEAK_PASSPHRASE';
    return;
  }
  if (next.value !== confirm.value) {
    mismatch.value = true;
    return;
  }
  busy.value = true;
  try {
    const res = await send({ type: 'session/change-passphrase', current: current.value, next: next.value });
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    const names = res.value.reenter.map(
      (reenter) => (res.value.view.instances ?? props.view.instances ?? []).find((i) => i.id === reenter)?.name ?? reenter,
    );
    status.value = names.length ? t('instances.reenterAfterChange', [names.join(', ')]) : t('passphrase.changed');
    clear();
    open.value = false;
    emit('changed');
    await nextTick();
    toggleButton.value?.focus();
  } catch {
    error.value = 'BAD_MESSAGE';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="passphrase">
    <button ref="toggleButton" type="button" :aria-expanded="open ? 'true' : 'false'" @click="toggle">
      {{ t('passphrase.changeTitle') }}
    </button>
    <form v-if="open" class="passphrase-form" @submit.prevent="submit" @keydown.esc="toggle">
      <label :for="id('current')">{{ t('passphrase.current') }}</label>
      <input
        :id="id('current')"
        ref="currentInput"
        v-model="current"
        name="current"
        type="password"
        autocomplete="current-password"
        required
      />
      <label :for="id('next')">{{ t('passphrase.next') }}</label>
      <input
        :id="id('next')"
        v-model="next"
        name="next"
        type="password"
        autocomplete="new-password"
        required
        :minlength="MIN_PASSPHRASE_LENGTH"
        :aria-describedby="id('help')"
      />
      <label :for="id('confirm')">{{ t('passphrase.confirm') }}</label>
      <input
        :id="id('confirm')"
        v-model="confirm"
        name="confirm"
        type="password"
        autocomplete="new-password"
        required
        :aria-invalid="mismatch"
      />
      <p :id="id('help')" class="help">{{ t('options.passphraseHelpNew', [String(MIN_PASSPHRASE_LENGTH)]) }}</p>
      <p v-if="mismatch" class="error" role="alert">{{ t('options.mismatch') }}</p>
      <ErrorBanner v-if="error" :code="error" />
      <div class="actions">
        <button class="primary" type="submit" :disabled="busy">{{ t('passphrase.submit') }}</button>
      </div>
    </form>
    <p v-if="status" class="passphrase-status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.passphrase {
  margin: 10px 0;
}
.help {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 0;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.passphrase-status {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 13px;
}
</style>
