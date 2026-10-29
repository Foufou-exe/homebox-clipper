<script setup lang="ts">
import type { ErrorCode } from '@/shared/errors';
import { errorMessage } from '@/ui/i18n';

defineProps<{ code: ErrorCode; tone?: 'error' | 'warning' }>();
</script>

<template>
  <div class="banner" :class="tone ?? 'error'" role="alert">
    <p>{{ errorMessage(code) }}</p>
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
