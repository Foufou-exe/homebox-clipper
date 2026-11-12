import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { registerDetectHandlers } from '@/background/detect';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { registerImportHandlers } from '@/background/import/handlers';
import { registerLocationHandlers } from '@/background/location/handlers';
import { startRouter } from '@/background/router';
import { browser } from '@/platform';

export default defineBackground(() => {
  // Old format (plaintext key): the key leaves the disk immediately.
  void configStore.migrateLegacy();
  registerConfigHandlers();
  registerDetectHandlers();
  registerImportHandlers();
  registerLocationHandlers();
  registerHistoryHandlers();
  startRouter();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });
});
