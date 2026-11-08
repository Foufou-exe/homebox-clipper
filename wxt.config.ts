import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  manifest: {
    // Manifest texts come from src/locales/en.yml (default language); French is served
    // from _locales/fr when the browser is set to French.
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // Principle V: no static host_permission. The Amazon tab is reachable
    // via activeTab; only the exact origin of the HomeBox instance is requested at runtime.
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://*/*',
      // HTTP is allowed for local-network instances only: the restriction to
      // private addresses is enforced by src/background/config/url-policy.ts.
      'http://*/*',
    ],
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT adds the `matches` of runtime-injected scripts to host_permissions.
      // Not needed here: injection goes through activeTab, when the popup opens (R9).
      delete manifest.host_permissions;
    },
  },
});
