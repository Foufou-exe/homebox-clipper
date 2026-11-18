import { activeImports } from '@/background/import/active-imports';
import { pendingStore } from '@/background/import/pending-store';
import { browser } from '@/platform';
import type { UpdateStateView } from '@/shared/types';
import { compareVersions, isVersion } from '@/shared/version';

/**
 * Update notice and ready update (spec 013, contracts/updates.md). Only version numbers and a flag are stored;
 * no network call: the browser signals the updates by itself.
 */

/** `{ v: 1, version, dismissed }` in storage.local: survives a restart, kept when the configuration is deleted. */
export const NOTICE_KEY = 'updateNotice';
/** `{ v: 1, version }` in storage.session: the version Chrome has ready, forgotten at restart or reload. */
export const READY_KEY = 'updateReady';

interface UpdateNotice {
  v: 1;
  version: string;
  dismissed: boolean;
}

interface UpdateReady {
  v: 1;
  version: string;
}

function parseNotice(raw: unknown): UpdateNotice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { v, version, dismissed } = raw as Record<string, unknown>;
  return v === 1 && isVersion(version) && typeof dismissed === 'boolean' ? { v: 1, version, dismissed } : null;
}

function parseReady(raw: unknown): UpdateReady | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { v, version } = raw as Record<string, unknown>;
  return v === 1 && isVersion(version) ? { v: 1, version } : null;
}

async function readNotice(): Promise<UpdateNotice | null> {
  return parseNotice((await browser.storage.local.get(NOTICE_KEY))[NOTICE_KEY]);
}

export const updateStore = {
  /**
   * `onInstalled` with reason `update`: writes a notice only if the installed version is strictly newer (never on a
   * rollback, an equal version or an unreadable previous version, FR-012). A notice already dismissed for this
   * version is not reopened.
   */
  async recordUpdate(previous: string | undefined, installed: string): Promise<void> {
    if (compareVersions(installed, previous) !== 1) return;
    const current = await readNotice();
    if (current?.version === installed && current.dismissed) return;
    const notice: UpdateNotice = { v: 1, version: installed, dismissed: false };
    await browser.storage.local.set({ [NOTICE_KEY]: notice });
  },

  /** `onUpdateAvailable`: remembers the ready version, nothing else (the extension does not insist). */
  async recordUpdateReady(version: string): Promise<void> {
    if (!isVersion(version)) return;
    const ready: UpdateReady = { v: 1, version };
    await browser.storage.session.set({ [READY_KEY]: ready });
  },

  /** Closes the notice of this version for good; without effect for another version. */
  async dismiss(version: string): Promise<void> {
    const current = await readNotice();
    if (current?.version !== version) return;
    await browser.storage.local.set({ [NOTICE_KEY]: { ...current, dismissed: true } });
  },

  /** True while an import runs or can still be resumed: applying the update would lose it (FR-015, E4). */
  async isBusy(): Promise<boolean> {
    return activeImports.size > 0 || (await pendingStore.ids()).size > 0;
  },

  /** Ready version strictly newer than the installed one, or null. */
  async readyVersion(installed: string): Promise<string | null> {
    const ready = parseReady((await browser.storage.session.get(READY_KEY))[READY_KEY]);
    return ready && compareVersions(ready.version, installed) === 1 ? ready.version : null;
  },

  async state(installed: string): Promise<UpdateStateView> {
    const notice = await readNotice();
    return {
      installed,
      notice: notice && notice.version === installed && !notice.dismissed ? notice.version : null,
      ready: await this.readyVersion(installed),
      blocked: await this.isBusy(),
    };
  },
};
