import { createApp } from 'vue';
import App from '@/ui/options/App.vue';
import { t, uiLanguage } from '@/ui/i18n';
import { initTheme } from '@/ui/theme';
import '@/ui/theme.css';

// Interface language (the HTML is in English by default).
document.documentElement.lang = uiLanguage();
// `__MSG_…__` placeholders are not interpreted in the HTML of an extension page.
document.title = t('options.pageTitle');

// Theme applied before mounting to avoid a flash of the wrong appearance.
void initTheme().finally(() => createApp(App).mount('#app'));
