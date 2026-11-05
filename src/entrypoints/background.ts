import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { registerDetectHandlers } from '@/background/detect';
import { registerImportHandlers } from '@/background/import/handlers';
import { registerLocationHandlers } from '@/background/location/handlers';
import { startRouter } from '@/background/router';
import { browser } from '@/platform';

export default defineBackground(() => {
  // Ancien format (clé en clair) : la clé quitte immédiatement le disque.
  void configStore.migrateLegacy();
  registerConfigHandlers();
  registerDetectHandlers();
  registerImportHandlers();
  registerLocationHandlers();
  startRouter();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });
});
