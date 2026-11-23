<script setup lang="ts">
import { computed, useId } from 'vue';
import type { EntityTypeOption } from '@/shared/types';
import { t } from '@/ui/i18n';
import { entityTypeLabels } from '@/ui/popup/entity-types';

const props = defineProps<{
  /** Item types of the target instance, already sorted by the service worker. */
  options: EntityTypeOption[];
  /** Chosen type; `null` = « server default » (only possible when `defaultId` is unknown). */
  modelValue: string | null;
  /** For the accessible label. */
  productName: string;
  /** Type HomeBox applies by default; `null` when unknown: a first « server default » option is then added. */
  defaultId: string | null;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

/*
 * Entity type of one product (spec 023, contracts/ui.md §2): a native select, never an ARIA combobox. Text by
 * interpolation only.
 */
const uid = useId();
const inputId = `${uid}-type`;
const labelled = computed(() =>
  entityTypeLabels(props.options).map((o) => ({
    id: o.id,
    label: o.id === props.defaultId ? t('entityType.defaultSuffix', [o.label]) : o.label,
  })),
);

function onSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', value === '' ? null : value);
}
</script>

<template>
  <div class="entity-type-picker">
    <label :for="inputId">{{ t('entityType.label') }}</label>
    <select
      :id="inputId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :aria-label="t('entityType.pickerFor', [productName])"
      @change="onSelect"
    >
      <option v-if="defaultId === null" value="">{{ t('entityType.serverDefault') }}</option>
      <option v-for="o in labelled" :key="o.id" :value="o.id">{{ o.label }}</option>
    </select>
  </div>
</template>

<style scoped>
.entity-type-picker {
  margin: 8px 0 2px;
}
.entity-type-picker label {
  display: block;
  font-size: 13px;
}
</style>
