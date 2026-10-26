<script setup lang="ts">
import { THEME_LABELS, nextTheme, saveTheme, themePreference as pref } from '@/ui/theme';
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
    :aria-label="`Thème : ${THEME_LABELS[pref]}. Changer de thème`"
    :title="`Thème : ${THEME_LABELS[pref]}`"
    @click="cycle"
  >
    <Icon :name="ICONS[pref]" />
  </button>
</template>
