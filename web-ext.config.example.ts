import { defineWebExtConfig } from 'wxt';

// Local `bun run dev` configuration: copy to web-ext.config.ts (ignored by git).
// https://wxt.dev/guide/essentials/config/browser-startup.html
export default defineWebExtConfig({
  // Ne pas ouvrir de navigateur (conteneur, ou chargement manuel de .output/chrome-mv3-dev/) :
  // disabled: true,

  // Use another Chromium-based browser:
  // binaries: { chrome: '/usr/bin/brave' },

  // Open a useful page directly:
  // startUrls: ['https://www.amazon.fr/your-orders/orders'],
});
