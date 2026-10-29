<script setup lang="ts">
import { t } from '@/ui/i18n';
import { nextTheme, saveTheme, themeLabel, themePreference as pref } from '@/ui/theme';
import Icon from './Icon.vue';

const ICONS = { auto: 'auto', light: 'sun', dark: 'moon' } as const;

async function cycle() {
  await saveTheme(nextTheme(pref.value));
}
</script>

<template>
  <button
    class="header-icon"
    type="button"
    :aria-label="t('theme.ariaLabel', [themeLabel(pref)])"
    :title="t('theme.title', [themeLabel(pref)])"
    @click="cycle"
  >
    <Icon :name="ICONS[pref]" />
  </button>
</template>
