import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'homebox-companion',
    description: 'Importez vos achats Amazon.fr dans votre inventaire HomeBox, après confirmation.',
    // Principe V : aucune host_permission statique. L'onglet Amazon est accessible
    // via activeTab ; seule l'origine exacte de l'instance HomeBox est demandée à l'exécution.
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://*/*',
      // HTTP éligible pour les instances du réseau local uniquement : la restriction aux
      // adresses privées est appliquée par src/background/config/url-policy.ts.
      'http://*/*',
    ],
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT ajoute les `matches` des scripts injectés à l'exécution aux host_permissions.
      // Inutile ici : l'injection se fait via activeTab, à l'ouverture du popup (R9).
      delete manifest.host_permissions;
    },
  },
});
