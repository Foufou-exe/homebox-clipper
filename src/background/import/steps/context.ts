import type { HomeBoxClient } from '@/background/homebox/client';
import type { Result } from '@/shared/errors';
import { logError } from '@/shared/logger';
import type { DraftPhoto, PendingImport } from '@/shared/types';
import type { FetchedPhoto } from '../photo-fetch';

export interface OrchestratorDeps {
  client: HomeBoxClient;
  store: {
    save(p: PendingImport): Promise<void>;
    get(id: string): Promise<PendingImport | null>;
    purge(p: PendingImport): Promise<void>;
  };
  /** Downloads a detected document via the script injected in the tab of the Amazon store of the order. */
  downloadDetected(tabId: number, url: string): Promise<Result<{ base64: string }>>;
  /** Fetches the photo from the merchant's server (separate module: it never has access to the key). */
  fetchPhoto(photo: DraftPhoto): Promise<Result<FetchedPhoto>>;
  /**
   * Remembers the last location used with this instance (R10): identifier only. Optional, and a
   * write error never interrupts the import.
   */
  rememberLocation?(locationId: string): Promise<void>;
  /**
   * Remembers the last entity type used with this instance (spec 023): a type identifier, or `null` when the server
   * default was used (the memory is erased). Optional, and a write error never interrupts the import.
   */
  rememberEntityType?(entityTypeId: string | null): Promise<void>;
  /**
   * Local import history (spec 012), bound to the history key and to the instance by the caller. Optional:
   * without it, the import behaves exactly as before. A write error never interrupts the import.
   */
  history?: {
    start(p: PendingImport): Promise<void>;
    update(p: PendingImport): Promise<void>;
  };
  notify(p: PendingImport): void;
  newId(): string;
}

/** What every import step needs: the HomeBox client, the dependencies, and the state writes. */
export interface StepContext {
  client: HomeBoxClient;
  deps: OrchestratorDeps;
  /** Saves the import state, updates the history entry, then notifies the popup. */
  persist(p: PendingImport): Promise<void>;
  /** History write: secondary to the import, logged by a constant code only (no data, FR-010). */
  record(kind: 'start' | 'update', p: PendingImport): Promise<void>;
}

export function createStepContext(deps: OrchestratorDeps): StepContext {
  const { client, store, notify } = deps;

  async function record(kind: 'start' | 'update', p: PendingImport): Promise<void> {
    if (!deps.history) return;
    try {
      await deps.history[kind](p);
    } catch {
      logError('history write failed', {
        endpoint: kind === 'start' ? 'history/start' : 'history/update',
      });
    }
  }

  async function persist(p: PendingImport): Promise<void> {
    await store.save(p);
    await record('update', p);
    notify(p);
  }

  return { client, deps, persist, record };
}
