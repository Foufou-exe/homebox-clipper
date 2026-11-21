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
  /** Name of the target instance, prefixed to the error with several instances (spec 016). */
  instance?: string;
  /** Spec 018 (FR-005): a template needs a location; the message is shown and the field marked invalid. */
  requiredMessage?: string;
  /** Spec 018: field marked invalid without its own message (several products, one of them needs a location). */
  invalid?: boolean;
}>();
const model = defineModel<LocationChoice | null>({ required: true });
const helpId = 'order-location-help';
const requiredId = 'order-location-required';
</script>

<template>
  <div class="card location-section">
    <p v-if="state === 'loading'" class="muted" role="status">{{ t('location.loading') }}</p>
    <template v-else-if="state === 'unavailable'">
      <ErrorBanner :code="error" tone="warning" :instance="instance" />
      <p class="muted">{{ t('location.unavailableHint') }}</p>
    </template>
    <p v-else-if="options.length === 0" class="muted">{{ t('location.empty') }}</p>
    <template v-else>
      <LocationPicker
        v-model="model"
        class="order-location"
        :options="options"
        :label="multi ? t('location.orderLabel') : t('location.singleLabel')"
        :described-by="[multi ? helpId : '', requiredMessage ? requiredId : ''].filter(Boolean).join(' ') || undefined"
        :invalid="!!requiredMessage || invalid"
      />
      <p v-if="multi" :id="helpId" class="muted help">{{ t('location.orderHelp') }}</p>
    </template>
    <p v-if="requiredMessage" :id="requiredId" class="required" role="alert">{{ requiredMessage }}</p>
  </div>
</template>

<style scoped>
.muted {
  color: var(--muted);
}
.required {
  margin: 6px 0 0;
  color: var(--danger-fg);
  font-size: 13px;
}
.help {
  margin: 6px 0 0;
  font-size: 12px;
}
</style>
