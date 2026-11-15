<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import type { WarrantyDraft } from '@/shared/types';
import { isValidIsoDate, reconcileWarranty, type NoDefaultReason } from '@/shared/warranty';
import { t } from '@/ui/i18n';
import { warrantyErrors } from '@/ui/popup/drafts';

/**
 * Warranty section of one product on the confirmation screen (spec 011): shows exactly what will be sent
 * (principle II), where the value comes from (principle IV) and why the section is empty when it is.
 */
const model = defineModel<WarrantyDraft | null | undefined>({ default: null });
const props = defineProps<{
  /** Why the section is empty (never sent nor persisted); `null` when unknown. */
  reason: NoDefaultReason | null;
  /** Purchase date of the product, `null` when absent. */
  purchaseDate: string | null;
  /** Several products: accessible names carry the product name. */
  multi?: boolean;
  productName?: string;
  /** Duration proposed by "Add a warranty" (`manualWarrantyMonths`). */
  manualMonths: number;
}>();

const id = useId();
/** Today's date in the local time zone (not UTC): a warranty is not "expired" a few hours early or late. */
const now = new Date();
const today = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
/** True only when the user typed in the details: those are then never replaced. */
const detailsTouched = ref(false);
/** Default details set aside while the neutral lifetime text is shown. */
const savedDetails = ref<string | null>(null);
const announce = ref('');
/** After a removal by the user the reason of the former proposal no longer applies. */
const removed = ref(false);
const addButton = ref<HTMLButtonElement | null>(null);
const dateInput = ref<HTMLInputElement | null>(null);

const errors = computed(() => warrantyErrors(model.value));
const noPurchaseDate = computed(() => !isValidIsoDate(props.purchaseDate));
const expired = computed(() => !!model.value && !model.value.lifetime && !!model.value.expires && model.value.expires < today);
const showReason = computed(() => !model.value && !removed.value && props.reason !== null);
const name = computed(() => props.productName ?? '');

/** Lifetime box: an untouched default text would contradict "lifetime", so it is swapped for a neutral one and restored on uncheck. */
function toggleLifetime(lifetime: boolean) {
  const current = model.value;
  if (!current) return;
  if (lifetime && !detailsTouched.value && current.origin !== 'user') {
    savedDetails.value = current.details;
    edit({ lifetime, details: t('warranty.lifetimeDetails') });
  } else if (!lifetime && savedDetails.value !== null && current.details === t('warranty.lifetimeDetails')) {
    const restored = savedDetails.value;
    savedDetails.value = null;
    edit({ lifetime, details: restored });
  } else {
    edit({ lifetime });
  }
}

function onDetails(details: string) {
  detailsTouched.value = true;
  savedDetails.value = null;
  edit({ details });
}

/** Any input of the user: the warranty is no longer recomputed (R6). */
function edit(patch: Partial<WarrantyDraft>) {
  if (model.value) model.value = { ...model.value, ...patch, edited: true };
}

function remove() {
  model.value = null;
  removed.value = true;
  announce.value = t('warranty.removed');
  void nextTick(() => addButton.value?.focus());
}

function add() {
  model.value = reconcileWarranty(
    { origin: 'user', expires: null, lifetime: false, details: '', durationMonths: props.manualMonths, edited: false },
    props.purchaseDate,
  );
  removed.value = false;
  announce.value = t('warranty.added');
  void nextTick(() => dateInput.value?.focus());
}

// Purchase date changed: recompute as long as the user has not touched the warranty (FR-005).
watch(
  () => props.purchaseDate,
  (date) => {
    const current = model.value;
    if (!current) return;
    const next = reconcileWarranty(current, date);
    if (next !== current) model.value = next;
  },
);
</script>

<template>
  <fieldset class="warranty">
    <legend>
      <h3>{{ t('warranty.title') }}</h3>
    </legend>

    <template v-if="model">
      <p class="origin">{{ t(`warranty.origin.${model.origin}`) }}</p>

      <label :for="`${id}-expires`">{{ t('warranty.expires') }}</label>
      <input
        :id="`${id}-expires`"
        ref="dateInput"
        type="date"
        :value="model.expires ?? ''"
        :disabled="model.lifetime"
        :aria-label="multi ? t('warranty.expiresFor', [name]) : undefined"
        :aria-describedby="`${id}-help${noPurchaseDate ? ` ${id}-nodate` : ''}`"
        @input="edit({ expires: ($event.target as HTMLInputElement).value || null })"
      />
      <p v-if="noPurchaseDate && !model.lifetime" :id="`${id}-nodate`" class="help">{{ t('warranty.noPurchaseDate') }}</p>
      <p v-if="expired" class="help" role="note">{{ t('warranty.expired') }}</p>

      <label class="pick">
        <input
          type="checkbox"
          :checked="model.lifetime"
          :aria-label="multi ? t('warranty.lifetimeFor', [name]) : undefined"
          :aria-describedby="`${id}-help`"
          @change="toggleLifetime(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('warranty.lifetime') }}</span>
      </label>

      <label :for="`${id}-details`">{{ t('warranty.details') }}</label>
      <textarea
        :id="`${id}-details`"
        :value="model.details"
        rows="2"
        maxlength="1000"
        :aria-label="multi ? t('warranty.detailsFor', [name]) : undefined"
        :aria-describedby="`${id}-help`"
        @input="onDetails(($event.target as HTMLTextAreaElement).value)"
      />

      <p :id="`${id}-help`" class="help">{{ t('warranty.help') }}</p>
      <p v-if="model.edited" class="help">{{ t('warranty.edited') }}</p>

      <ul v-if="errors.length" class="errors" role="alert">
        <li v-for="e in errors" :key="e">{{ e }}</li>
      </ul>

      <button type="button" :aria-label="multi ? t('warranty.removeFor', [name]) : undefined" @click="remove">
        {{ t('warranty.remove') }}
      </button>
    </template>

    <template v-else>
      <p class="none">{{ t('warranty.none') }}</p>
      <p v-if="showReason" :id="`${id}-reason`" class="help reason">{{ t(`warranty.reason.${reason!}`) }}</p>
      <button
        ref="addButton"
        type="button"
        :aria-label="multi ? t('warranty.addFor', [name]) : undefined"
        :aria-describedby="showReason ? `${id}-reason` : undefined"
        @click="add"
      >
        {{ t('warranty.add') }}
      </button>
    </template>

    <p class="sr-only" role="status">{{ announce }}</p>
  </fieldset>
</template>

<style scoped>
.warranty {
  border: none;
  border-top: 1px solid var(--border);
  padding: 8px 0 0;
  margin: 10px 0 0;
  min-width: 0;
}
h3 {
  display: inline;
  margin: 0;
  font-size: 13px;
}
.origin {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--muted);
}
.none {
  margin: 0 0 4px;
  font-size: 13px;
}
.help {
  color: var(--muted);
  font-size: 12px;
  margin: 4px 0 0;
}
.pick {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 13px;
}
.pick input {
  width: auto;
}
.errors {
  color: var(--danger-fg);
  font-size: 12px;
  margin: 6px 0 0;
  padding-left: 16px;
}
button {
  margin-top: 8px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
