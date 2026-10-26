<script setup lang="ts">
import { ref } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';

defineProps<{ config: ConfigView }>();
const emit = defineEmits<{ unlocked: [view: ConfigView] }>();

const passphrase = ref('');
const busy = ref(false);
const error = ref<ErrorCode | null>(null);

async function unlock() {
  busy.value = true;
  error.value = null;
  try {
    const res = await send({ type: 'session/unlock', passphrase: passphrase.value });
    if (res.ok) emit('unlocked', res.value);
    else error.value = res.error;
  } finally {
    passphrase.value = '';
    busy.value = false;
  }
}
</script>

<template>
  <form class="unlock card" @submit.prevent="unlock">
    <InstanceBadge :config="config" />
    <p>🔒 Saisissez votre phrase de passe pour déverrouiller la clé API pour cette session.</p>
    <label for="unlock-passphrase">Phrase de passe</label>
    <input
      id="unlock-passphrase"
      v-model="passphrase"
      type="password"
      autocomplete="current-password"
      required
      autofocus
    />
    <ErrorBanner v-if="error" :code="error" />
    <div class="actions">
      <button class="primary" type="submit" :disabled="busy || passphrase === ''">
        {{ busy ? 'Déverrouillage…' : 'Déverrouiller' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.unlock p {
  font-size: 13px;
}
.actions {
  margin-top: 10px;
}
</style>
