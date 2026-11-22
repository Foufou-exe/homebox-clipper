<script setup lang="ts">
import type { OrderFieldRole } from '@/shared/order-fields';
import type { LineOrderFields, OrderFieldRow } from '@/ui/popup/order-fields';
import { t } from '@/ui/i18n';

/*
 * Order fields of one product (spec 019, contracts/ui.md §2.2): each field that will be created is shown with its name
 * and its value before the confirmation (principle II). The number is the single existing entry (read-only here);
 * the merchant and the URL are edited here without touching the notes. Text by interpolation only; nothing is logged.
 */
const props = defineProps<{ rows: OrderFieldRow[]; idPrefix: string; modelValue: LineOrderFields }>();
const emit = defineEmits<{ 'update:modelValue': [value: LineOrderFields] }>();

const inputId = (role: OrderFieldRole) => `${props.idPrefix}-${role}`;
const errorId = (role: OrderFieldRole) => `${props.idPrefix}-${role}-err`;
const noteId = (role: OrderFieldRole) => `${props.idPrefix}-${role}-note`;
const ERROR_TEXT = {
  tooLong: () => t('orderFields.valueTooLong'),
  invalidUrl: () => t('orderFields.invalidUrl'),
} as const;

/** Error shown only for a field that will be sent. */
const errorOf = (r: OrderFieldRow) => (r.state === 'create' || r.state === 'merged' ? r.error : null);
const describedBy = (r: OrderFieldRow) =>
  [errorOf(r) ? errorId(r.role) : null, r.state === 'empty' ? noteId(r.role) : null].filter(Boolean).join(' ') || undefined;

function edit(role: 'merchant' | 'orderUrl', e: Event) {
  const value = (e.target as HTMLInputElement).value;
  emit('update:modelValue', { ...props.modelValue, [role]: { value, edited: true } });
}
</script>

<template>
  <fieldset class="order-fields">
    <legend>{{ t('orderFields.section') }}</legend>
    <div v-for="r in rows" :key="r.role" class="row">
      <template v-if="r.role === 'orderNumber'">
        <p class="number">
          <span class="name">{{ r.name }}</span>
          <span v-if="r.state !== 'empty'" class="value">{{ r.value }}</span>
        </p>
        <p class="muted help">{{ t('orderFields.editAbove') }}</p>
      </template>
      <p v-else-if="r.state === 'conflict'" class="number">
        <span class="name">{{ r.name }}</span>
      </p>
      <template v-else>
        <label :for="inputId(r.role)">{{ r.name }}</label>
        <input
          :id="inputId(r.role)"
          :type="r.role === 'orderUrl' ? 'url' : 'text'"
          :value="r.value"
          autocomplete="off"
          :aria-invalid="errorOf(r) ? 'true' : undefined"
          :aria-describedby="describedBy(r)"
          @input="edit(r.role as 'merchant' | 'orderUrl', $event)"
        />
      </template>
      <p v-if="r.state === 'empty'" :id="noteId(r.role)" class="muted help">{{ t('orderFields.notSet') }}</p>
      <p v-if="r.state === 'merged'" class="muted help">{{ t('orderFields.merged', [r.templateFieldName ?? r.name]) }}</p>
      <!-- Non-blocking (FR-017): the template field is kept, this order field is not created. -->
      <output v-if="r.state === 'conflict'" class="help conflict">{{ t('orderFields.typeConflict', [r.name, r.templateType ?? '']) }}</output>
      <p v-if="errorOf(r)" :id="errorId(r.role)" class="error" role="alert">{{ ERROR_TEXT[errorOf(r)!]() }}</p>
    </div>
  </fieldset>
</template>

<style scoped>
.order-fields {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px 8px;
  margin: 8px 0;
}
.order-fields legend {
  font-size: 13px;
  font-weight: 600;
}
.order-fields label {
  display: block;
  margin-top: 6px;
  font-size: 13px;
}
.number {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 0;
  font-size: 13px;
}
.value {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.muted {
  color: var(--muted);
}
.help {
  margin: 2px 0 0;
  font-size: 12px;
}
.conflict {
  display: block;
}
.error {
  margin: 2px 0 0;
  color: var(--danger-fg);
  font-size: 12px;
}
</style>
