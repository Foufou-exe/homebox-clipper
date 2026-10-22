import { defineConfig } from 'wxt';

/** Modes où HTTP est accepté pour l'instance HomeBox (principe V : drapeau de build). */
const HTTP_MODES = ['development', 'homelab'];

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  manifest: ({ mode }) => ({
    name: mode === 'homelab' ? 'homebox-companion (homelab)' : 'homebox-companion',
    description: 'Importez vos achats Amazon.fr dans votre inventaire HomeBox, après confirmation.',
    // Principe V : aucune host_permission statique. L'onglet Amazon est accessible
    // via activeTab ; seule l'origine exacte de l'instance HomeBox est demandée à l'exécution.
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      // Builds de dev/homelab : instance HomeBox en HTTP sur le réseau local.
      ...(HTTP_MODES.includes(mode) ? ['http://*/*'] : []),
    ],
  }),
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT ajoute les `matches` des scripts injectés à l'exécution aux host_permissions.
      // Inutile ici : l'injection se fait via activeTab, à l'ouverture du popup (R9).
      delete manifest.host_permissions;
    },
  },
});
