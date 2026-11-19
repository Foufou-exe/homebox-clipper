<script setup lang="ts">
import { computed } from 'vue';
import type { InstanceView } from '@/shared/types';
import { t } from '@/ui/i18n';
import Icon from './Icon.vue';

/** One HomeBox instance (spec 016): address, state of the last test, version and the unencrypted HTTP warning. */
const props = defineProps<{ instance: InstanceView }>();

const isHttp = computed(() => props.instance.baseUrl.startsWith('http:'));
const status = computed(() => props.instance.lastCheck?.status);
</script>

<template>
  <div class="instance" :aria-label="t('common.instanceAria')">
    <Icon name="pin" :size="14" />
    <span class="dot" :class="status ?? 'unknown'" aria-hidden="true" />
    <span class="label">{{ t('common.instanceLabel') }}</span>
    <strong class="url">{{ instance.baseUrl }}</strong>
    <span v-if="instance.lastCheck?.version" class="version">v{{ instance.lastCheck.version }}</span>
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
