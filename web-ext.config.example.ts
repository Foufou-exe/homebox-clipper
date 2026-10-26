import { defineWebExtConfig } from 'wxt';

// Configuration locale de `bun run dev` : copier en web-ext.config.ts (ignoré par git).
// https://wxt.dev/guide/essentials/config/browser-startup.html
export default defineWebExtConfig({
  // Ne pas ouvrir de navigateur (conteneur, ou chargement manuel de .output/chrome-mv3-dev/) :
  // disabled: true,

  // Utiliser un autre navigateur basé sur Chromium :
  // binaries: { chrome: '/usr/bin/brave' },

  // Ouvrir directement une page utile :
  // startUrls: ['https://www.amazon.fr/your-orders/orders'],
});
