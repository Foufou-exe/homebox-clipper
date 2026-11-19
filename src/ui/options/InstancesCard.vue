<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { MAX_INSTANCES } from '@/background/config/instance-store';
import type { ErrorCode } from '@/shared/errors';
import type { ConfigView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import { t } from '@/ui/i18n';
import InstanceForm from './InstanceForm.vue';

/**
 * HomeBox instances of the options page (spec 016, US2, contracts/ui.md §2): one group per instance (from two
 * instances on; with a single one the page keeps its former look), and « Add an instance », disabled at the limit
 * with the reason. The management actions (test, rename, change, delete) come with US4.
 */
const props = defineProps<{ view: ConfigView }>();
const emit = defineEmits<{ changed: [] }>();

const uid = useId();
const limitId = `${uid}-limit`;
const instances = computed(() => props.view.instances ?? []);
const max = computed(() => props.view.maxInstances ?? MAX_INSTANCES);
const atLimit = computed(() => instances.value.length >= max.value);
const adding = ref(false);
const announce = ref('');
const failure = ref<{ code: ErrorCode; name: string } | null>(null);
const addButton = ref<HTMLButtonElement | null>(null);

async function close() {
  adding.value = false;
  await nextTick();
  addButton.value?.focus();
}

async function toggle() {
  if (adding.value) return close();
  announce.value = '';
  failure.value = null;
  adding.value = true;
}

async function onDone({ name, error }: { name: string; error: ErrorCode | null }) {
  announce.value = t('instances.added', [name]);
  failure.value = error ? { code: error, name } : null;
  emit('changed');
  await close();
}
</script>

<template>
  <div class="instances">
    <template v-if="instances.length > 1">
      <section
        v-for="i in instances"
        :key="i.id"
        class="instance-card"
        role="group"
        :aria-label="t('instances.cardAria', [i.name])"
      >
        <h2>{{ i.name }}</h2>
        <InstanceBadge :instance="i" />
        <p class="masked">{{ i.maskedKey }}</p>
      </section>
    </template>

    <ErrorBanner v-if="failure" :code="failure.code" :instance="failure.name" />

    <button
      ref="addButton"
      class="add"
      type="button"
      :disabled="atLimit"
      :aria-expanded="adding ? 'true' : 'false'"
      :aria-describedby="atLimit ? limitId : undefined"
      @click="toggle"
    >
      {{ t('instances.add') }}
    </button>
    <p v-if="atLimit" :id="limitId" class="help">{{ t('instances.limitReached', [String(max)]) }}</p>

    <InstanceForm v-if="adding" :view="view" autofocus @done="onDone" @cancel="close" />

    <!-- Native status element: <output> has the implicit "status" role. -->
    <output class="instances-announce">{{ announce }}</output>
  </div>
</template>

<style scoped>
.instances {
  margin-top: 12px;
}
.instance-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 0 0 8px;
}
.instance-card h2 {
  font-size: 15px;
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}
.masked {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0 0;
}
.help {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 0;
}
.instances-announce {
  display: block;
  font-size: 13px;
  margin-top: 6px;
}
</style>
