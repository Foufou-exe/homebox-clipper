<script setup lang="ts">
import { t } from '@/ui/i18n';

/*
 * Order page link of one product (spec 025, contracts/ui.md §2): the address that will be stored in HomeBox is shown
 * before the confirmation (principle II). Native checkbox, checked by default; text by interpolation only; nothing is
 * logged nor persisted (the state lives in the popup, like the other lines of the summary).
 */
const props = defineProps<{ modelValue: boolean; url: string; idPrefix: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const boxId = `${props.idPrefix}-orderlink`;
const helpId = `${props.idPrefix}-orderlink-help`;
</script>

<template>
  <div class="order-link">
    <div class="check">
      <input
        :id="boxId"
        type="checkbox"
        :checked="modelValue"
        :aria-describedby="helpId"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <label :for="boxId">{{ t('orderLink.fieldLabel') }}</label>
    </div>
    <p :id="helpId" class="muted help">{{ t('orderLink.fieldHelp', [url]) }}</p>
  </div>
</template>

<style scoped>
.order-link {
  margin: 6px 0;
  font-size: 13px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
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
  overflow-wrap: anywhere;
}
</style>
