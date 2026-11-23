<script setup lang="ts">
import { computed } from 'vue';
import { MAX_IDENTIFIER_BYTES, type IdentifierKey } from '@/shared/identifiers';
import { t, type MessageKey } from '@/ui/i18n';
import { tooLongKeys, type LineIdentifiers } from '@/ui/popup/identifiers';

/*
 * Manufacturer, model and serial number of one product (spec 027, contracts/ui.md): what will be saved is shown and
 * editable (principle II). `keys`: the fields shown (all three, or the serial number only with a template, D3). Native
 * inputs with labels; text by interpolation only; nothing is logged nor persisted.
 */
const props = defineProps<{
  modelValue: LineIdentifiers;
  keys: ReadonlySet<IdentifierKey>;
  idPrefix: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: LineIdentifiers] }>();

const LABELS: Record<IdentifierKey, MessageKey> = {
  manufacturer: 'identifiers.manufacturer',
  modelNumber: 'identifiers.modelNumber',
  serialNumber: 'identifiers.serialNumber',
};
const ORDER: readonly IdentifierKey[] = ['manufacturer', 'modelNumber', 'serialNumber'];
const shown = computed(() => ORDER.filter((k) => props.keys.has(k)));
const tooLong = computed(() => new Set(tooLongKeys(props.modelValue, props.keys)));
const withTemplate = computed(() => !props.keys.has('manufacturer'));
const inputId = (k: IdentifierKey) => `${props.idPrefix}-id-${k}`;
const errorId = (k: IdentifierKey) => `${props.idPrefix}-id-${k}-err`;
const helpId = (k: IdentifierKey) => `${props.idPrefix}-id-${k}-help`;
const describedBy = (k: IdentifierKey) =>
  [k === 'serialNumber' ? helpId(k) : '', tooLong.value.has(k) ? errorId(k) : ''].filter(Boolean).join(' ') || undefined;

function update(key: IdentifierKey, e: Event) {
  emit('update:modelValue', { ...props.modelValue, [key]: (e.target as HTMLInputElement).value });
}
</script>

<template>
  <fieldset class="identifiers">
    <legend>{{ t('identifiers.legend') }}</legend>
    <p v-if="withTemplate" class="muted note">{{ t('identifiers.templateNote') }}</p>
    <p v-else-if="modelValue.notFound" class="muted note">{{ t('identifiers.notFound') }}</p>
    <template v-for="k in shown" :key="k">
      <label :for="inputId(k)">{{ t(LABELS[k]) }}</label>
      <input
        :id="inputId(k)"
        type="text"
        autocomplete="off"
        :value="modelValue[k]"
        :aria-invalid="tooLong.has(k) ? 'true' : undefined"
        :aria-describedby="describedBy(k)"
        @input="update(k, $event)"
      />
      <p v-if="k === 'serialNumber'" :id="helpId(k)" class="muted note">{{ t('identifiers.serialHelp') }}</p>
      <p v-if="tooLong.has(k)" :id="errorId(k)" class="error" role="alert">{{ t('identifiers.tooLong', [String(MAX_IDENTIFIER_BYTES)]) }}</p>
    </template>
  </fieldset>
</template>

<style scoped>
.identifiers {
  margin: 6px 0;
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
.note {
  margin: 2px 0 4px;
  font-size: 12px;
}
.error {
  margin: 2px 0 4px;
  font-size: 12px;
  color: var(--danger-fg);
}
</style>
