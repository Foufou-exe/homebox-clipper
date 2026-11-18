import { register } from '@/background/router';
import { browser } from '@/platform';
import { ok } from '@/shared/errors';
import { updateStore } from './update-store';

/** Installed version, read from the manifest (the one actually running). */
export const installedVersion = (): string => browser.runtime.getManifest().version;

/** `update/*` messages (013, contracts/runtime-messages.md): extension pages only (`'update/'` in UI_ONLY_PREFIXES). */
export function registerUpdateHandlers(): void {
  register('update/state', () => updateStore.state(installedVersion()));

  register('update/dismiss', async ({ version }) => {
    await updateStore.dismiss(version);
    return ok(undefined);
  });

  // Never an automatic reload, never an update check that would query a server (FR-016): only on the user's click.
  register('update/apply', async () => {
    if (await updateStore.isBusy()) return { applied: false, reason: 'busy' };
    if ((await updateStore.readyVersion(installedVersion())) === null) return { applied: false, reason: 'none' };
    // Next turn, so that the answer reaches the page before the reload closes it.
    // Busy checked again at that moment: an import started meanwhile is never cut by the reload.
    setTimeout(() => {
      void updateStore
        .isBusy()
        .then((busy) => {
          if (!busy) browser.runtime.reload();
        })
        .catch(() => undefined);
    }, 0);
    return { applied: true };
  });
}
