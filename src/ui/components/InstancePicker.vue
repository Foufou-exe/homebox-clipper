<script setup lang="ts">
import { computed } from 'vue';
import type { InstanceView } from '@/shared/types';
import { t } from '@/ui/i18n';
import { hostOf } from '@/ui/instances';
import InstanceBadge from './InstanceBadge.vue';

/**
 * Target instance of the summary (spec 016, US3, contracts/ui.md §3), shown from two instances on: a native labelled
 * `<select>` (keyboard and screen reader without extra code), the badge of the chosen instance (address, state,
 * unencrypted HTTP: FR-013) and a polite live region announcing the reload. Disabled once the import is confirmed.
 * Names are rendered as text only.
 */
const props = defineProps<{ instances: InstanceView[]; submitting: boolean; announce: string }>();
const target = defineModel<string>({ required: true });
const selected = computed(() => props.instances.find((i) => i.id === target.value) ?? props.instances[0] ?? null);
</script>

<template>
  <div class="instance-picker">
    <label for="instance-target">{{ t('summary.instanceTarget') }}</label>
    <select id="instance-target" v-model="target" :disabled="submitting" aria-describedby="instance-target-badge">
      <option v-for="i in instances" :key="i.id" :value="i.id">{{ t('summary.instanceOption', [i.name, hostOf(i.baseUrl)]) }}</option>
    </select>
    <InstanceBadge v-if="selected" id="instance-target-badge" :instance="selected" />
    <p class="sr-only" aria-live="polite">{{ announce }}</p>
  </div>
</template>

<style scoped>
.instance-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
}
.instance-picker label {
  font-size: 13px;
  color: var(--fg);
}
.instance-picker select {
  font: inherit;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
