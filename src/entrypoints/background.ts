import { registerConfigHandlers } from '@/background/config/handlers';
import { registerDetectHandlers } from '@/background/detect';
import { registerImportHandlers } from '@/background/import/handlers';
import { startRouter } from '@/background/router';
import { browser } from '@/platform';

export default defineBackground(() => {
  registerConfigHandlers();
  registerDetectHandlers();
  registerImportHandlers();
  startRouter();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });
});
