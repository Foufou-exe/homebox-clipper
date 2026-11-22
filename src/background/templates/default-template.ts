import { DEFAULT_TEMPLATE_KEY } from '@/background/config/config-store';
import { enqueueConfigWrite } from '@/background/config/instance-store';
import { browser } from '@/platform';
import type { DefaultTemplateRef, TemplateOption } from '@/shared/types';

type ByInstance = Record<string, DefaultTemplateRef>;

const isRef = (x: unknown): x is DefaultTemplateRef => {
  if (typeof x !== 'object' || x === null) return false;
  const { id, name } = x as Record<string, unknown>;
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && typeof name === 'string' && name.length >= 1 && name.length <= 255;
};

/** Reads the table, ignoring any value or entry that is not `{ instanceId: { id, name } }` (corrupted storage). */
async function read(): Promise<ByInstance> {
  const stored = (await browser.storage.local.get(DEFAULT_TEMPLATE_KEY))[DEFAULT_TEMPLATE_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>)
      .filter(([, v]) => isRef(v))
      .map(([k, v]) => [k, { id: (v as DefaultTemplateRef).id, name: (v as DefaultTemplateRef).name }]),
  );
}

/**
 * Default template per HomeBox instance (spec 018, FR-024, contracts/storage.md §2): identifier and name only, in
 * `storage.local` (configuration data). Removed with the instance (`instanceStore.remove`) and with the settings
 * (`instanceStore.clear`). Never logged.
 */
export const defaultTemplate = {
  async get(instanceId: string): Promise<DefaultTemplateRef | null> {
    return (await read())[instanceId] ?? null;
  },

  /** Read-modify-write in the configuration write queue: ordered with `instanceStore.remove` (no orphan entry). */
  set(instanceId: string, ref: DefaultTemplateRef): Promise<void> {
    return enqueueConfigWrite(async () => {
      await browser.storage.local.set({ [DEFAULT_TEMPLATE_KEY]: { ...(await read()), [instanceId]: { id: ref.id, name: ref.name } } });
    });
  },

  remove(instanceId: string): Promise<void> {
    return enqueueConfigWrite(async () => {
      const kept = Object.entries(await read()).filter(([k]) => k !== instanceId);
      await browser.storage.local.set({ [DEFAULT_TEMPLATE_KEY]: Object.fromEntries(kept) });
    });
  },

  /** Updates the name if the id is in the list; returns the state. Never erases the entry. */
  async reconcile(
    instanceId: string,
    list: readonly TemplateOption[],
  ): Promise<{ ref: DefaultTemplateRef | null; state: 'none' | 'ok' | 'missing' }> {
    const ref = await this.get(instanceId);
    if (!ref) return { ref: null, state: 'none' };
    const found = list.find((t) => t.id === ref.id);
    if (!found) return { ref, state: 'missing' };
    if (found.name !== ref.name && isRef({ id: ref.id, name: found.name })) {
      const renamed = { id: ref.id, name: found.name };
      await this.set(instanceId, renamed);
      return { ref: renamed, state: 'ok' };
    }
    return { ref, state: 'ok' };
  },
};
