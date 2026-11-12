<script setup lang="ts">
import { onMounted, ref } from 'vue';
import HistoryList from '@/ui/components/HistoryList.vue';
import { t } from '@/ui/i18n';

/** Popup history view (012, contracts/ui.md): "Back" first, then the title, which receives the focus. */
defineProps<{ baseUrl: string }>();
const emit = defineEmits<{ close: []; unlock: [] }>();
const title = ref<HTMLElement | null>(null);

onMounted(() => title.value?.focus());
</script>

<template>
  <section class="history-view" @keydown.esc="emit('close')">
    <button type="button" class="back" @click="emit('close')">{{ t('history.back') }}</button>
    <h2 ref="title" tabindex="-1">{{ t('history.title') }}</h2>
    <p class="intro">{{ t('history.intro') }}</p>
    <HistoryList :base-url="baseUrl" variant="popup" @unlock="emit('unlock')" />
  </section>
</template>

<style scoped>
.back {
  margin: 0 0 6px;
}
h2 {
  font-size: 15px;
  margin: 0 0 4px;
}
h2:focus {
  outline: none;
}
.intro {
  color: var(--muted);
  font-size: 12px;
  margin: 0 0 8px;
}
</style>
