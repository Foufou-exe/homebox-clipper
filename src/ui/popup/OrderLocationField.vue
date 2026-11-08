<script setup lang="ts">
import type { ErrorCode } from '@/shared/errors';
import type { LocationChoice, LocationOption } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import LocationPicker from '@/ui/components/LocationPicker.vue';
import { t } from '@/ui/i18n';

/**
 * The order's only location field. A HomeBox object has only one parent: with a single product, it is
 * labelled "Location"; with several, "Product location" and a hint recalls the rule.
 */
defineProps<{
  state: 'loading' | 'ready' | 'unavailable';
  error: ErrorCode;
  options: LocationOption[];
  multi: boolean;
}>();
const model = defineModel<LocationChoice | null>({ required: true });
const helpId = 'order-location-help';
</script>

<template>
  <div class="card location-section">
    <p v-if="state === 'loading'" class="muted" role="status">{{ t('location.loading') }}</p>
    <template v-else-if="state === 'unavailable'">
      <ErrorBanner :code="error" tone="warning" />
      <p class="muted">{{ t('location.unavailableHint') }}</p>
    </template>
    <p v-else-if="options.length === 0" class="muted">{{ t('location.empty') }}</p>
    <template v-else>
      <LocationPicker
        v-model="model"
        class="order-location"
        :options="options"
        :label="multi ? t('location.orderLabel') : t('location.singleLabel')"
        :described-by="multi ? helpId : undefined"
      />
      <p v-if="multi" :id="helpId" class="muted help">{{ t('location.orderHelp') }}</p>
    </template>
  </div>
</template>

<style scoped>
.muted {
  color: var(--muted);
}
.help {
  margin: 6px 0 0;
  font-size: 12px;
}
</style>
