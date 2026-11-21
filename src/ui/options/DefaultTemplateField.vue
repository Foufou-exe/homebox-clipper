<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { DefaultTemplateRef, InstanceView, TemplateOption } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/*
 * Default HomeBox template of one instance (spec 018, FR-024, FR-025, contracts/ui.md §3). Readable while locked
 * (`template/get-default`, no network); changing it needs the extension unlocked and reads the templates of THIS
 * instance only. Names are rendered as text; nothing is logged.
 */
const props = defineProps<{ instance: InstanceView; locked: boolean }>();

const uid = useId();
const selectId = `${uid}-select`;
const current = ref<DefaultTemplateRef | null>(null);
const open = ref(false);
const state = ref<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
const error = ref<ErrorCode>('TEMPLATES_UNAVAILABLE');
const options = ref<TemplateOption[]>([]);
const missing = ref(false);
const choice = ref('');
const busy = ref(false);
const announce = ref('');

async function loadDefault() {
  try {
    const res = await send({ type: 'template/get-default', instanceId: props.instance.id });
    current.value = res?.ok ? (res.value?.defaultTemplate ?? null) : null;
  } catch {
    current.value = null;
  }
}

async function loadList() {
  state.value = 'loading';
  try {
    const res = await send({ type: 'template/list', instanceId: props.instance.id });
    if (!res?.ok || !Array.isArray(res.value?.templates)) {
      error.value = res && !res.ok ? res.error : 'TEMPLATES_UNAVAILABLE';
      state.value = 'error';
      return;
    }
    options.value = res.value.templates;
    current.value = res.value.defaultTemplate ?? null;
    missing.value = res.value.defaultState === 'missing';
    choice.value = res.value.defaultState === 'ok' && current.value ? current.value.id : '';
    state.value = options.value.length ? 'ready' : 'empty';
  } catch {
    error.value = 'TEMPLATES_UNAVAILABLE';
    state.value = 'error';
  }
}

async function toggle() {
  open.value = !open.value;
  announce.value = '';
  if (open.value) await loadList();
}

async function save() {
  busy.value = true;
  announce.value = '';
  try {
    const res = await send({ type: 'template/set-default', instanceId: props.instance.id, templateId: choice.value || null });
    if (!res?.ok) {
      error.value = res ? res.error : 'TEMPLATES_UNAVAILABLE';
      state.value = 'error';
      return;
    }
    current.value = res.value.defaultTemplate;
    missing.value = false;
    announce.value = t('templates.defaultSaved');
  } catch {
    error.value = 'TEMPLATES_UNAVAILABLE';
    state.value = 'error';
  } finally {
    busy.value = false;
  }
}

onMounted(loadDefault);
// Locking closes the panel: changing the default needs the extension unlocked.
watch(
  () => props.locked,
  (locked) => {
    if (locked) open.value = false;
  },
);
</script>

<template>
  <div class="default-template">
    <p class="current">
      <span>{{ t('templates.defaultLabel') }}</span>
      <strong>{{ current ? current.name : t('templates.none') }}</strong>
    </p>
    <p v-if="locked" class="muted">{{ t('templates.unlockToChange') }}</p>
    <template v-else>
      <button type="button" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ t('templates.change') }}</button>
      <div v-if="open" class="panel">
        <output v-if="state === 'loading'" class="muted">{{ t('templates.loading') }}</output>
        <ErrorBanner v-else-if="state === 'error'" :code="error" :instance="instance.name">
          <button type="button" @click="loadList">{{ t('templates.retry') }}</button>
        </ErrorBanner>
        <p v-else-if="state === 'empty'" class="muted">{{ t('templates.noneOnInstance') }}</p>
        <template v-else-if="state === 'ready'">
          <output v-if="missing" class="muted">{{ t('templates.defaultMissing') }}</output>
          <label :for="selectId">{{ t('templates.defaultLabel') }}</label>
          <select :id="selectId" v-model="choice">
            <option value="">{{ t('templates.none') }}</option>
            <option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <button type="button" :disabled="busy" @click="save">{{ t('templates.save') }}</button>
        </template>
      </div>
    </template>
    <output>{{ announce }}</output>
  </div>
</template>

<style scoped>
.default-template {
  margin: 8px 0;
  font-size: 13px;
}
.current {
  display: flex;
  gap: 6px;
  margin: 0 0 4px;
}
.panel {
  margin-top: 6px;
}
.panel label {
  display: block;
  margin-bottom: 2px;
}
.muted {
  color: var(--muted);
}
output.muted {
  display: block;
  margin: 1em 0;
}
</style>
