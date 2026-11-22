<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { errorMessage, t } from '@/ui/i18n';
import { completionErrorMessage } from '@/ui/popup/completion';

/**
 * `instance`: name of the instance concerned (spec 016); the message is then prefixed with it (`common.instanceError`).
 * `completion` (spec 021): the error of an existing item being completed, never "the item was created".
 */
const props = defineProps<{ code: ErrorCode; tone?: 'error' | 'warning'; instance?: string; completion?: boolean }>();
const message = computed(() => (props.completion ? completionErrorMessage(props.code) : errorMessage(props.code)));
</script>

<template>
  <div class="banner" :class="tone ?? 'error'" role="alert">
    <p>{{ instance ? t('common.instanceError', [instance, message]) : message }}</p>
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.banner {
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 8px 0;
  font-size: 13px;
}
.banner p {
  margin: 0;
}
.error {
  background: var(--danger-bg);
  color: var(--danger-fg);
}
.warning {
  background: var(--warn-bg);
  color: var(--warn-fg);
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
</style>
