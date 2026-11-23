<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import type { CollectionList, CollectionSetting } from '@/shared/collections';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { InstanceView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/*
 * Target HomeBox collection of one instance (spec 024, contracts/ui.md §1). The setting comes with the view (readable
 * while locked, FR-014); the list is read on THIS instance only when the panel opens (FR-003). A native select, hidden
 * when the key reaches one collection only (FR-004). Names are rendered as text; nothing is logged.
 */
const props = defineProps<{ instance: InstanceView; locked: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const uid = useId();
const selectId = `${uid}-collection`;
const setting = ref<CollectionSetting | null>(props.instance.collection ?? null);
const open = ref(false);
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const error = ref<ErrorCode>('COLLECTIONS_UNAVAILABLE');
const list = ref<CollectionList | null>(null);
const choice = ref('');
const busy = ref(false);
const announce = ref('');

watch(
  () => props.instance.collection,
  (next) => {
    setting.value = next ?? null;
  },
);

/** Known single collection with the default setting: nothing to choose (FR-004). */
const single = computed(
  () => !props.instance.collectionInvalid && !setting.value?.chosen && setting.value?.seen?.several === false,
);
const currentText = computed(() => {
  const s = setting.value;
  if (s?.chosen) return s.chosen.name;
  if (!s?.seen) return t('collections.defaultOfKey');
  return single.value ? t('collections.onlyOne', [s.seen.name]) : t('collections.defaultOfKeyNamed', [s.seen.name]);
});
const onlyOneInList = computed(() => !!list.value && list.value.collections.length < 2 && !list.value.setting.chosen);

function show(res: CollectionList) {
  list.value = res;
  setting.value = res.setting;
  choice.value = res.setting.chosen?.id ?? '';
  state.value = 'ready';
}

async function load() {
  state.value = 'loading';
  try {
    const res = await send({ type: 'instance/collections', instanceId: props.instance.id });
    if (!res?.ok || !res.value) {
      error.value = res && !res.ok ? res.error : 'COLLECTIONS_UNAVAILABLE';
      state.value = 'error';
      return;
    }
    show(res.value);
  } catch {
    error.value = 'COLLECTIONS_UNAVAILABLE';
    state.value = 'error';
  }
}

async function toggle() {
  open.value = !open.value;
  announce.value = '';
  if (open.value) await load();
}

async function save() {
  busy.value = true;
  announce.value = '';
  try {
    const res = await send({ type: 'instance/set-collection', instanceId: props.instance.id, collectionId: choice.value || null });
    if (!res?.ok || !res.value) {
      error.value = res && !res.ok ? res.error : 'COLLECTIONS_UNAVAILABLE';
      state.value = 'error';
      return;
    }
    show(res.value);
    announce.value = t('collections.saved');
    emit('changed');
  } catch {
    error.value = 'COLLECTIONS_UNAVAILABLE';
    state.value = 'error';
  } finally {
    busy.value = false;
  }
}

// Locking closes the panel: changing the collection needs the extension unlocked.
watch(
  () => props.locked,
  (locked) => {
    if (locked) open.value = false;
  },
);
</script>

<template>
  <div class="target-collection">
    <p class="current">
      <span>{{ t('collections.label') }}</span>
      <strong>{{ currentText }}</strong>
    </p>
    <!-- M3: an unreadable stored setting refuses the imports until a collection is chosen again. -->
    <ErrorBanner v-if="instance.collectionInvalid && !list" code="COLLECTION_UNAVAILABLE" :instance="instance.name" />
    <p v-if="locked" class="muted">{{ t('collections.unlockToChange') }}</p>
    <template v-else-if="!single">
      <button type="button" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ t('collections.change') }}</button>
      <div v-if="open" class="panel">
        <output v-if="state === 'loading'" class="muted">{{ t('collections.loading') }}</output>
        <ErrorBanner v-else-if="state === 'error'" :code="error" :instance="instance.name">
          <button type="button" @click="load">{{ t('collections.retry') }}</button>
        </ErrorBanner>
        <template v-else-if="state === 'ready' && list">
          <ErrorBanner v-if="list.missing" code="COLLECTION_UNAVAILABLE" :instance="instance.name" />
          <p v-if="onlyOneInList" class="muted">{{ t('collections.onlyOneOnInstance', [list.defaultCollection.name]) }}</p>
          <template v-else>
            <label :for="selectId">{{ t('collections.label') }}</label>
            <select :id="selectId" v-model="choice">
              <option value="">{{ t('collections.defaultOfKeyNamed', [list.defaultCollection.name]) }}</option>
              <option v-for="c in list.collections" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <p class="muted">{{ t('collections.help') }}</p>
            <button type="button" :disabled="busy" @click="save">{{ t('collections.save') }}</button>
          </template>
        </template>
      </div>
    </template>
    <output>{{ announce }}</output>
  </div>
</template>

<style scoped>
.target-collection {
  margin: 8px 0;
  font-size: 13px;
}
.current {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 4px;
  overflow-wrap: anywhere;
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
