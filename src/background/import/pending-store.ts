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

  /** Identifiers of the imports still in the session (retryable). */
  async ids(): Promise<Set<string>> {
    const all = await browser.storage.session.get(null);
    return new Set(
      Object.keys(all)
        .filter((k) => k.startsWith(PENDING_PREFIX))
        .map((k) => k.slice(PENDING_PREFIX.length))
        .map((rest) => rest.slice(rest.indexOf(':') + 1)),
    );
  },

  /**
   * Spec 016 (US4-6): removes every `pendingImport:*` of this deleted instance. Rule: also those without `instanceId`
   * (previous version). Deleting needs at least two instances, so such an import was already unattributable
   * (`retryTarget` attaches it only when exactly one instance exists); it must not become attributable to the
   * survivor, nor outlive the deletion (PRIVACY: deleting an instance erases its interrupted imports).
   */
  async removeByInstance(instanceId: string): Promise<void> {
    const all = await browser.storage.session.get(null);
    const keys = Object.entries(all)
      .filter(([k, v]) => {
        if (!k.startsWith(PENDING_PREFIX)) return false;
        const id = (v as Partial<PendingImport> | null)?.instanceId;
        return id === instanceId || typeof id !== 'string';
      })
      .map(([k]) => k);
    if (keys.length) await browser.storage.session.remove(keys);
  },

  async purge(pending: Pick<PendingImport, 'tabId' | 'id'>): Promise<void> {
    await browser.storage.session.remove(keyOf(pending));
  },
};
