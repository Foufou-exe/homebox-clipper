<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';
import { DEFAULT_WARRANTY_SETTINGS } from '@/shared/warranty';
import { t } from '@/ui/i18n';
import { loadWarrantySettings, saveWarrantySettings } from '@/ui/warranty-settings';

/**
 * "Warranty" card of the options page (spec 011, contracts/ui.md section 3): turns the default warranty on or
 * off and sets its duration. Saved at each valid change; no message to the service worker.
 */
const id = useId();
const enabled = ref(DEFAULT_WARRANTY_SETTINGS.enabled);
/** Text of the duration field: empty means `null` (the legal duration of the country). */
const years = ref('');
const invalid = ref(false);
const announce = ref('');
const saveFailed = ref(false);
/** True as soon as the user acts: the initial load must not overwrite it. */
let touched = false;

onMounted(async () => {
  const stored = await loadWarrantySettings();
  if (touched) return;
  enabled.value = stored.enabled;
  years.value = stored.years === null ? '' : String(stored.years);
});

/** `undefined`: invalid. Empty is valid (`null`); otherwise a whole number from 1 to 10. */
function parsedYears(): number | null | undefined {
  const text = years.value.trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : undefined;
}

function onEnabled(event: Event) {
  touched = true;
  enabled.value = (event.target as HTMLInputElement).checked;
  return save();
}

function onYears(event: Event) {
  touched = true;
  years.value = (event.target as HTMLInputElement).value;
  return save();
}

async function save() {
  const value = parsedYears();
  invalid.value = value === undefined;
  if (value === undefined) {
    announce.value = '';
    return;
  }
  const written = await saveWarrantySettings({ v: 1, enabled: enabled.value, years: value });
  saveFailed.value = !written;
  announce.value = written ? t('warranty.settings.saved') : '';
}
</script>

<template>
  <section class="card">
    <h2>{{ t('warranty.settings.title') }}</h2>
    <p class="intro">{{ t('warranty.settings.intro') }}</p>
    <label class="check">
      <input type="checkbox" :checked="enabled" :aria-describedby="`${id}-help`" @change="onEnabled" />
      <span>{{ t('warranty.settings.enable') }}</span>
    </label>
    <label :for="`${id}-years`">{{ t('warranty.settings.years') }}</label>
    <input
      :id="`${id}-years`"
      :value="years"
      type="number"
      min="1"
      max="10"
      step="1"
      :disabled="!enabled"
      :aria-describedby="`${id}-help`"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onYears"
    />
    <p :id="`${id}-help`" class="help">{{ t('warranty.settings.help') }}</p>
    <p v-if="invalid" class="error" role="alert">{{ t('warranty.settings.yearsInvalid') }}</p>
    <p v-if="saveFailed" class="error" role="alert">{{ t('warranty.settings.saveFailed') }}</p>
    <p class="success" role="status">{{ announce }}</p>
  </section>
</template>

<style scoped>
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
.intro,
.help {
  color: var(--muted);
  font-size: 13px;
}
.help {
  margin: 4px 0 0;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 14px;
  margin: 8px 0;
}
.check input {
  width: auto;
}
input[type='number'] {
  width: 6em;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
.success {
  color: var(--success-fg, var(--fg));
  font-size: 13px;
  margin: 6px 0 0;
}
</style>
