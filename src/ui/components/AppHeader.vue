<script setup lang="ts">
import logo from '@/assets/logo.svg';
import { t } from '@/ui/i18n';

defineProps<{ subtitle?: string }>();
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <img :src="logo" alt="" width="28" height="28" />
      <div>
        <span class="name">{{ t('header.brand') }} <span class="companion">{{ t('header.companion') }}</span></span>
        <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
      </div>
    </div>
    <div class="actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
/* Barre supérieure sombre, comme celle de HomeBox. */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--header-bg);
  color: var(--header-fg);
  padding: 8px 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  display: block;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fff;
}
.companion {
  font-weight: 500;
  color: var(--header-fg);
}
.subtitle {
  display: block;
  font-size: 11px;
  opacity: 0.8;
}
.actions {
  display: flex;
  gap: 4px;
}
.actions :deep(.header-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border: none;
  color: var(--accent-fg);
  padding: 6px;
  border-radius: var(--radius);
}
.actions :deep(.header-icon:hover) {
  background: var(--accent-hover);
}
</style>
