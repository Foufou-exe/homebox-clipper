import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  // One build per browser from the same code (`wxt build` then `wxt build -b firefox`).
  targetBrowsers: ['chrome', 'firefox'],
  // Manifest V3 for every browser: no MV2 build, even with `wxt -b firefox`.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    // Manifest texts come from src/locales/en.yml (default language); French is served
    // from _locales/fr when the browser is set to French.
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // Principle V: no static host_permission. The Amazon tab is reachable
    // via activeTab; only the exact origin of the HomeBox instance is requested at runtime.
    // Same permissions in both builds (checked by tests/build/manifest.test.ts).
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://*/*',
      // HTTP is allowed for local-network instances only: the restriction to
      // private addresses is enforced by src/background/config/url-policy.ts.
      'http://*/*',
    ],
    // Firefox only: fixed add-on id (keeps the data between temporary loads and identifies the
    // add-on on addons.mozilla.org), minimum version, and the data collection declaration (the order
    // page content leaves the browser only to the user's own HomeBox instance, after confirmation).
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'homebox-clipper@foufou-exe.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['websiteContent'] },
            },
          },
        }
      : {}),
  }),
  zip: {
    // Firefox (AMO) source archive: allowlist only. WXT does not read .gitignore: without this list
    // it would ship homebox/, *.pepper, coverage/ and specs/.
    includeSources: [
      'src/**',
      'public/**',
      'package.json',
      'bun.lock',
      'tsconfig.json',
      'wxt.config.ts',
      'LICENSE',
      'README.md',
      'docs/store/amo-build.md',
    ],
    // Never shipped, even inside an allowed folder: raw fixtures, secrets, private keys and certificates.
    excludeSources: ['**/raw/**', '**/*.pepper', '**/.env*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx'],
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT adds the `matches` of runtime-injected scripts to host_permissions.
      // Not needed here: injection goes through activeTab, when the popup opens (R9).
      delete manifest.host_permissions;
    },
  },
});
