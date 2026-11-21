<script setup lang="ts">
import { computed, useId } from 'vue';
import { MAX_FIELD_TEXT, fieldError, type FieldInput, type LineTemplate } from '@/ui/popup/drafts';
import { t } from '@/ui/i18n';

/*
 * Values of the template chosen for one product (spec 018, contracts/ui.md §1.4): everything that will be saved is
 * shown and editable (principle II). Text by interpolation only; nothing is logged.
 */
const props = defineProps<{ modelValue: LineTemplate; productName: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: LineTemplate] }>();

const uid = useId();
const fieldId = (i: number) => `${uid}-field-${i}`;
const errorId = (i: number) => `${uid}-field-${i}-err`;
const legend = computed(() => t('templates.sectionLegend', [props.modelValue.detail?.name ?? '']));
const ERROR_TEXT = {
  notInteger: () => t('templates.errors.notInteger'),
  invalidDate: () => t('templates.errors.invalidDate'),
  tooLong: () => t('templates.errors.tooLong', [String(MAX_FIELD_TEXT)]),
} as const;

function update(values: Partial<LineTemplate['values']>) {
  emit('update:modelValue', { ...props.modelValue, values: { ...props.modelValue.values, ...values } });
}
function updateField(index: number, change: Partial<FieldInput>) {
  const fields = props.modelValue.values.fields.map((f, i) => {
    if (i !== index) return f;
    const next = { ...f, ...change };
    return { ...next, error: fieldError(next) };
  });
  update({ fields });
}
const text = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
</script>

<template>
  <fieldset class="template-section">
    <legend>{{ legend }}</legend>
    <label :for="`${uid}-manufacturer`">{{ t('templates.manufacturer') }}</label>
    <input
      :id="`${uid}-manufacturer`"
      type="text"
      maxlength="255"
      :value="modelValue.values.manufacturer"
      @input="update({ manufacturer: text($event) })"
    />
    <label :for="`${uid}-model`">{{ t('templates.modelNumber') }}</label>
    <input :id="`${uid}-model`" type="text" maxlength="255" :value="modelValue.values.modelNumber" @input="update({ modelNumber: text($event) })" />
    <div class="check">
      <input :id="`${uid}-insured`" type="checkbox" :checked="modelValue.values.insured" @change="update({ insured: checked($event) })" />
      <label :for="`${uid}-insured`">{{ t('templates.insured') }}</label>
    </div>

    <div v-if="modelValue.values.fields.length" class="fields">
      <div v-for="(f, i) in modelValue.values.fields" :key="i" class="field">
        <template v-if="f.view.kind === 'boolean'">
          <div class="check">
            <input :id="fieldId(i)" type="checkbox" :checked="f.checked" @change="updateField(i, { checked: checked($event) })" />
            <label :for="fieldId(i)">{{ f.view.name }}</label>
          </div>
        </template>
        <template v-else>
          <label :for="fieldId(i)">{{ f.view.name }}</label>
          <input
            v-if="f.view.kind === 'unknown'"
            :id="fieldId(i)"
            type="text"
            readonly
            :value="f.view.textValue"
            :aria-describedby="`${fieldId(i)}-help`"
          />
          <input
            v-else-if="f.view.kind === 'number'"
            :id="fieldId(i)"
            type="text"
            inputmode="numeric"
            :value="f.raw"
            :aria-invalid="f.error ? 'true' : undefined"
            :aria-describedby="f.error ? errorId(i) : undefined"
            @input="updateField(i, { raw: text($event) })"
          />
          <input
            v-else-if="f.view.kind === 'time'"
            :id="fieldId(i)"
            type="date"
            min="1900-01-01"
            max="2200-12-31"
            :value="f.raw"
            :aria-invalid="f.error ? 'true' : undefined"
            :aria-describedby="f.error ? errorId(i) : undefined"
            @input="updateField(i, { raw: text($event) })"
          />
          <input
            v-else
            :id="fieldId(i)"
            type="text"
            :maxlength="MAX_FIELD_TEXT"
            :value="f.raw"
            :aria-invalid="f.error ? 'true' : undefined"
            :aria-describedby="f.error ? errorId(i) : undefined"
            @input="updateField(i, { raw: text($event) })"
          />
          <p v-if="f.view.kind === 'unknown'" :id="`${fieldId(i)}-help`" class="muted help">{{ t('templates.readOnlyType') }}</p>
          <p v-if="f.error" :id="errorId(i)" class="error" role="alert">{{ ERROR_TEXT[f.error]() }}</p>
        </template>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.template-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px 8px;
  margin: 8px 0;
}
.template-section legend {
  font-size: 13px;
  font-weight: 600;
}
.template-section label {
  display: block;
  margin-top: 6px;
  font-size: 13px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.check label {
  margin-top: 0;
}
.check input {
  width: auto;
}
.muted {
  color: var(--muted);
}
.help {
  margin: 2px 0 0;
  font-size: 12px;
}
.error {
  margin: 2px 0 0;
  color: var(--danger-fg);
  font-size: 12px;
}
</style>
