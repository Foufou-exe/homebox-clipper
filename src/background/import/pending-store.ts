import { PENDING_PREFIX } from '@/background/config/config-store';
import { browser } from '@/platform';
import type { PendingImport } from '@/shared/types';

/**
 * Imports in progress, in storage.session (in memory, cleared when the browser closes — R11).
 * Never contains the file bytes.
 */
const keyOf = (p: Pick<PendingImport, 'tabId' | 'id'>) => `${PENDING_PREFIX}${p.tabId}:${p.id}`;

export const pendingStore = {
  async save(pending: PendingImport): Promise<void> {
    await browser.storage.session.set({ [keyOf(pending)]: pending });
  },

  async get(id: string): Promise<PendingImport | null> {
    const all = await browser.storage.session.get(null);
    const key = Object.keys(all).find((k) => k.startsWith(PENDING_PREFIX) && k.endsWith(`:${id}`));
    return key ? (all[key] as PendingImport) : null;
  },

  async listByTab(tabId: number): Promise<PendingImport[]> {
    const all = await browser.storage.session.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith(`${PENDING_PREFIX}${tabId}:`))
      .map(([, v]) => v as PendingImport);
  },

  async purge(pending: Pick<PendingImport, 'tabId' | 'id'>): Promise<void> {
    await browser.storage.session.remove(keyOf(pending));
  },
};
