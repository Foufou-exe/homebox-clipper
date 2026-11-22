<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import {
  DEFAULT_ORDER_FIELD_NAMES,
  ORDER_FIELD_ROLES,
  caseVariantOf,
  fieldNameError,
  isOrderFieldSettings,
  type FieldNameError,
  type OrderFieldRole,
  type OrderFieldSettings,
} from '@/shared/order-fields';
import type { InstanceView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import FieldNameCombobox from '@/ui/components/FieldNameCombobox.vue';
import { t } from '@/ui/i18n';

/*
 * Order fields as HomeBox custom fields, setting of one instance (spec 019, FR-001 to FR-008, contracts/ui.md §1.1).
 * The option and the names hold no secret: readable and writable while locked (`order-fields/get|set`, no network).
 * Only the suggestions need the extension unlocked: the names (never the values) of THIS instance, read at the first
 * focus, kept in memory while the page is open, forgotten when locked, never stored. Nothing is logged.
 */
const props = defineProps<{ instance: InstanceView; locked: boolean }>();

const uid = useId();
const root = ref<HTMLElement | null>(null);
const boxId = `${uid}-enabled`;
const helpId = `${uid}-help`;
const errorId = (role: OrderFieldRole) => `${uid}-${role}-err`;
const failureId = `${uid}-suggestions-err`;
const LABEL_KEYS = {
  orderNumber: 'orderFields.nameOrderNumber',
  merchant: 'orderFields.nameMerchant',
  orderUrl: 'orderFields.nameOrderUrl',
} as const;
const ERROR_KEYS = {
  empty: 'orderFields.errors.empty',
  tooLong: 'orderFields.errors.tooLong',
  duplicate: 'orderFields.errors.duplicate',
  forbiddenChar: 'orderFields.errors.forbiddenChar',
} as const;
const byRole = <T,>(value: T): Record<OrderFieldRole, T> => ({ orderNumber: value, merchant: value, orderUrl: value });

const enabled = ref(false);
/** Names in the inputs; those read (the defaults at first use) until the user changes them. */
const names = reactive<Record<OrderFieldRole, string>>({ ...DEFAULT_ORDER_FIELD_NAMES });
const nameErrors = reactive(byRole<FieldNameError | null>(null));
/** Existing name differing only by case (FR-005), shown after leaving the input. */
const caseHints = reactive(byRole<string | null>(null));
const error = ref<ErrorCode | null>(null);
const busy = ref(false);
const announce = ref('');

/** Suggestions (FR-004): memory of this page only (FR-034). */
const suggestions = ref<string[]>([]);
const suggestionState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const suggestionError = ref<ErrorCode>('FIELD_NAMES_UNAVAILABLE');
/** Input under which a failure of the suggestions is shown. */
const suggestionRole = ref<OrderFieldRole>('orderNumber');
const comboState = computed(() => (props.locked ? 'locked' : suggestionState.value));
const hasNameError = computed(() => ORDER_FIELD_ROLES.some((r) => nameErrors[r] !== null));

function apply(s: OrderFieldSettings) {
  enabled.value = s.enabled;
  Object.assign(names, s.names);
}

async function load() {
  try {
    const res = await send({ type: 'order-fields/get', instanceId: props.instance.id });
    if (res?.ok && isOrderFieldSettings(res.value?.settings)) {
      apply(res.value.settings);
      return;
    }
    if (res && !res.ok) error.value = res.error;
  } catch {
    // the default stays shown
  }
}

async function loadSuggestions() {
  suggestionState.value = 'loading';
  try {
    const res = await send({ type: 'order-fields/names', instanceId: props.instance.id });
    if (props.locked) return;
    if (res?.ok && Array.isArray(res.value?.names)) {
      suggestions.value = res.value.names.filter((n): n is string => typeof n === 'string');
      suggestionState.value = 'ready';
      return;
    }
    suggestionError.value = res && !res.ok ? res.error : 'FIELD_NAMES_UNAVAILABLE';
    suggestionState.value = 'error';
  } catch {
    suggestionError.value = 'FIELD_NAMES_UNAVAILABLE';
    suggestionState.value = 'error';
  }
}

/** First focus of one of the three inputs, unlocked only: one read shared by the three inputs. */
function onFocus(role: OrderFieldRole) {
  suggestionRole.value = role;
  if (!props.locked && suggestionState.value === 'idle') void loadSuggestions();
}

function onInput(role: OrderFieldRole, value: string) {
  names[role] = value;
  nameErrors[role] = null;
  caseHints[role] = null;
}

function onBlur(role: OrderFieldRole) {
  caseHints[role] = suggestionState.value === 'ready' ? caseVariantOf(names[role], suggestions.value) : null;
}

function useExisting(role: OrderFieldRole) {
  const existing = caseHints[role];
  if (existing !== null) onInput(role, existing);
}

function resetNames() {
  for (const role of ORDER_FIELD_ROLES) onInput(role, DEFAULT_ORDER_FIELD_NAMES[role]);
}

const describedBy = (role: OrderFieldRole) =>
  [
    nameErrors[role] ? errorId(role) : null,
    suggestionState.value === 'error' && !props.locked && suggestionRole.value === role ? failureId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

/** FR-003: every name checked against the two others of this instance; `true` if all are valid. */
function validate(): boolean {
  for (const role of ORDER_FIELD_ROLES) {
    const others = ORDER_FIELD_ROLES.filter((r) => r !== role).map((r) => names[r]);
    nameErrors[role] = fieldNameError(names[role], others);
  }
  return !hasNameError.value;
}

async function focusFirstError() {
  await nextTick();
  root.value?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
}

async function save() {
  announce.value = '';
  error.value = null;
  if (!validate()) {
    await focusFirstError();
    return;
  }
  busy.value = true;
  try {
    const trimmed = byRole('');
    for (const role of ORDER_FIELD_ROLES) trimmed[role] = names[role].trim();
    const res = await send({ type: 'order-fields/set', instanceId: props.instance.id, settings: { enabled: enabled.value, names: trimmed } });
    if (!res?.ok) {
      error.value = res ? res.error : 'BAD_MESSAGE';
      return;
    }
    if (isOrderFieldSettings(res.value?.settings)) apply(res.value.settings);
    announce.value = t('orderFields.saved');
  } catch {
    error.value = 'BAD_MESSAGE';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
// Locking forgets the suggestions: they are read again, unlocked, at the next focus.
watch(
  () => props.locked,
  (locked) => {
    if (!locked) return;
    suggestions.value = [];
    suggestionState.value = 'idle';
    for (const role of ORDER_FIELD_ROLES) caseHints[role] = null;
  },
);
</script>

<template>
  <div ref="root" class="order-fields-settings">
    <div class="check">
      <input :id="boxId" v-model="enabled" type="checkbox" :aria-describedby="helpId" />
      <label :for="boxId">{{ t('orderFields.optionLabel') }}</label>
    </div>
    <p :id="helpId" class="muted help">{{ t('orderFields.optionHelp') }}</p>
    <ErrorBanner v-if="error" :code="error" :instance="instance.name" />
    <div v-if="enabled || hasNameError" class="names">
      <p v-if="locked" class="muted help">{{ t('orderFields.unlockForSuggestions') }}</p>
      <div v-for="role in ORDER_FIELD_ROLES" :key="role" class="name">
        <FieldNameCombobox
          :model-value="names[role]"
          :label="t(LABEL_KEYS[role])"
          :options="suggestions"
          :state="comboState"
          :invalid="nameErrors[role] !== null"
          :described-by="describedBy(role)"
          @update:model-value="onInput(role, $event)"
          @focus="onFocus(role)"
          @blur="onBlur(role)"
        />
        <p v-if="nameErrors[role]" :id="errorId(role)" class="error" role="alert">{{ t(ERROR_KEYS[nameErrors[role]!]) }}</p>
        <div v-if="suggestionState === 'error' && !locked && suggestionRole === role" class="failure">
          <p :id="failureId" class="error">{{ t(`error.${suggestionError}`) }}</p>
          <button type="button" @click="loadSuggestions">{{ t('orderFields.retry') }}</button>
        </div>
        <template v-if="caseHints[role]">
          <output class="case-hint">{{ t('orderFields.caseWarning', [caseHints[role]!]) }}</output>
          <button type="button" @click="useExisting(role)">{{ t('orderFields.useExisting', [caseHints[role]!]) }}</button>
        </template>
      </div>
      <button type="button" class="link" @click="resetNames">{{ t('orderFields.resetNames') }}</button>
    </div>
    <button type="button" :disabled="busy" @click="save">{{ t('orderFields.save') }}</button>
    <output class="announce">{{ announce }}</output>
  </div>
</template>

<style scoped>
.order-fields-settings {
  margin: 8px 0;
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
  margin: 2px 0 6px;
  font-size: 12px;
}
.names {
  margin: 4px 0 8px;
}
.error {
  margin: 2px 0 0;
  color: var(--danger-fg);
  font-size: 12px;
}
.case-hint {
  display: block;
  margin: 2px 0 0;
  font-size: 12px;
}
.announce:empty {
  display: none;
}
</style>
