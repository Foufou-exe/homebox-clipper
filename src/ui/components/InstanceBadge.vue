<script setup lang="ts">
import { computed } from 'vue';
import type { ConfigView } from '@/shared/types';
import { t } from '@/ui/i18n';
import Icon from './Icon.vue';

const props = defineProps<{ config: ConfigView }>();

const isHttp = computed(() => props.config.baseUrl?.startsWith('http:') ?? false);
const status = computed(() => props.config.lastCheck?.status);
</script>

<template>
  <div class="instance" :aria-label="t('common.instanceAria')">
    <Icon name="pin" :size="14" />
    <span class="dot" :class="status ?? 'unknown'" aria-hidden="true" />
    <span class="label">{{ t('common.instanceLabel') }}</span>
    <strong class="url">{{ config.baseUrl }}</strong>
    <span v-if="config.lastCheck?.version" class="version">v{{ config.lastCheck.version }}</span>
    <span v-if="isHttp" class="http" :title="t('common.httpWarningHint')">
      {{ t('common.httpWarning') }}
    </span>
  </div>
</template>

<style scoped>
.instance {
  background: var(--bg);
  border-radius: var(--radius);
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  flex-wrap: wrap;
}
.url {
  color: var(--fg);
  word-break: break-all;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.dot.ok {
  background: var(--success-fg);
}
.dot.error {
  background: var(--danger-fg);
}
.http {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: 999px;
  padding: 0 4px;
}
</style>
