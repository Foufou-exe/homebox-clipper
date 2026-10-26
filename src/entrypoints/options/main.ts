import { createApp } from 'vue';
import App from '@/ui/options/App.vue';
import { initTheme } from '@/ui/theme';
import '@/ui/theme.css';

// Thème appliqué avant le montage pour éviter un flash de la mauvaise apparence.
void initTheme().finally(() => createApp(App).mount('#app'));
