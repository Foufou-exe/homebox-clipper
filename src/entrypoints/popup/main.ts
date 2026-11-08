import { createApp } from 'vue';
import App from '@/ui/popup/App.vue';
import { t, uiLanguage } from '@/ui/i18n';
import { initTheme } from '@/ui/theme';
import '@/ui/theme.css';

// Langue de l'interface (le HTML est en anglais par défaut).
document.documentElement.lang = uiLanguage();
// Les `__MSG_…__` ne sont pas interprétés dans le HTML d'une page d'extension.
document.title = t('popup.pageTitle');

// Thème appliqué avant le montage pour éviter un flash de la mauvaise apparence.
void initTheme().finally(() => createApp(App).mount('#app'));
