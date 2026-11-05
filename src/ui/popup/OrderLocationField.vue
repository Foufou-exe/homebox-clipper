<script setup lang="ts">
import type { ErrorCode } from '@/shared/errors';
import type { LocationChoice, LocationOption } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import LocationPicker from '@/ui/components/LocationPicker.vue';
import { t } from '@/ui/i18n';

/**
 * Le seul champ d'emplacement de la commande. Un objet HomeBox n'a qu'un parent : avec un seul produit, il
 * s'appelle « Emplacement » ; avec plusieurs, « Emplacement des produits » et une aide rappelle la règle.
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
