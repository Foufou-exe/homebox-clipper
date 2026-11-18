<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';
import { DEFAULT_LOCK_SETTINGS, LOCK_POLICIES, isLockPolicy, type LockPolicy } from '@/shared/lock-policy';
import { send } from '@/shared/messages';
import { t, type MessageKey } from '@/ui/i18n';

/**
 * "Automatic lock" card of the options page (spec 013, contracts/ui.md): five choices, no "never" (FR-001 to
 * FR-003). The setting is written by the service worker (`session/set-policy`), without the passphrase (FR-008).
 */
const LABELS: Record<LockPolicy, MessageKey> = {
  'browser-close': 'lock.policy.browserClose',
  'idle-15m': 'lock.policy.idle15m',
  'idle-1h': 'lock.policy.idle1h',
  'idle-4h': 'lock.policy.idle4h',
  'every-open': 'lock.policy.everyOpen',
};

const id = useId();
const policy = ref<LockPolicy>(DEFAULT_LOCK_SETTINGS.policy);
const announce = ref('');
const saveFailed = ref(false);
/** True as soon as the user acts: the initial load must not overwrite the choice. */
let touched = false;

onMounted(async () => {
  try {
    const stored = await send({ type: 'session/get-policy' });
    if (!touched && isLockPolicy(stored?.policy)) policy.value = stored.policy;
  } catch {
    // service worker unreachable: the default stays displayed
  }
});

async function onChange(event: Event) {
  touched = true;
  const previous = policy.value;
  const next = (event.target as HTMLInputElement).value;
  if (!isLockPolicy(next)) return;
  policy.value = next;
  announce.value = '';
  saveFailed.value = false;
  let saved: boolean;
  try {
    const result = await send({ type: 'session/set-policy', policy: next });
    saved = result?.ok === true;
  } catch {
    saved = false;
  }
  if (saved) {
    announce.value = t('lock.settings.saved');
  } else {
    policy.value = previous;
    saveFailed.value = true;
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t('lock.settings.title') }}</h2>
    <p class="intro">{{ t('lock.settings.intro') }}</p>
    <fieldset class="policies" :aria-describedby="`${id}-why ${id}-help`">
      <legend>{{ t('lock.settings.legend') }}</legend>
      <label v-for="value in LOCK_POLICIES" :key="value" class="radio">
        <input type="radio" :name="`${id}-policy`" :value="value" :checked="policy === value" @change="onChange" />
        {{ t(LABELS[value]) }}
      </label>
    </fieldset>
    <p :id="`${id}-why`" class="help">{{ t('lock.settings.whyNoNever') }}</p>
    <p :id="`${id}-help`" class="help">{{ t('lock.settings.inactivityHelp') }}</p>
    <p v-if="saveFailed" class="error" role="alert">{{ t('lock.settings.saveFailed') }}</p>
    <p class="success" role="status">{{ announce }}</p>
  </section>
</template>

<style scoped>
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
.intro,
.help {
  color: var(--muted);
  font-size: 13px;
}
.help {
  margin: 6px 0 0;
}
.policies {
  border: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
legend {
  color: var(--fg);
  font-size: 14px;
  font-weight: 600;
  padding: 0;
  margin-bottom: 4px;
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
.radio input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
.success {
  color: var(--success-fg, var(--fg));
  font-size: 13px;
  margin: 6px 0 0;
}
</style>
