import { registerAutoLock } from '@/background/config/auto-lock';
import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { registerDetectHandlers } from '@/background/detect';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { registerImportHandlers } from '@/background/import/handlers';
import { registerLocationHandlers } from '@/background/location/handlers';
import { registerTagHandlers } from '@/background/tags/handlers';
import { startRouter } from '@/background/router';
import { installedVersion, registerUpdateHandlers } from '@/background/update/handlers';
import { updateStore } from '@/background/update/update-store';
import { browser } from '@/platform';

export default defineBackground(() => {
  // Old format (plaintext key): the key leaves the disk immediately.
  void configStore.migrateLegacy();
  // 013 (A-14): a session whose inactivity limit passed while the service worker was stopped is locked first.
  void configStore.expireIfDue().catch(() => undefined);
  registerAutoLock();
  registerConfigHandlers();
  registerDetectHandlers();
  registerImportHandlers();
  registerLocationHandlers();
  registerTagHandlers();
  registerHistoryHandlers();
  registerUpdateHandlers();
  startRouter();

  browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    // Never a notice at installation (FR-012).
    if (reason === 'install') void browser.runtime.openOptionsPage();
    if (reason === 'update') return updateStore.recordUpdate(previousVersion, installedVersion()).catch(() => undefined);
  });

  // 013 (R7): the browser signals a downloaded update by itself; no request is made to find out.
  browser.runtime.onUpdateAvailable.addListener(({ version }) => {
    return updateStore.recordUpdateReady(version).catch(() => undefined);
  });
});
