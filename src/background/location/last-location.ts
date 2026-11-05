import { LAST_LOCATION_KEY } from '@/background/config/config-store';
import { originOf } from '@/background/config/url-policy';
import { browser } from '@/platform';

type ByInstance = Record<string, string>;

/** Lit la table, en ignorant toute valeur qui n'est pas `{ origine: identifiant }` (stockage corrompu). */
async function read(): Promise<ByInstance> {
  const stored = (await browser.storage.local.get(LAST_LOCATION_KEY))[LAST_LOCATION_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, v]) => typeof v === 'string')) as ByInstance;
}

/**
 * Dernier emplacement utilisé, par instance HomeBox (R10, FR-020, FR-021).
 * Identifiants techniques seuls : jamais de nom d'emplacement ni de donnée d'achat. Local au navigateur
 * (`storage.local`) ; effacé en entier par `configStore.delete()`.
 */
export const lastLocation = {
  async get(baseUrl: string): Promise<string | null> {
    return (await read())[originOf(baseUrl)] ?? null;
  },

  async set(baseUrl: string, locationId: string): Promise<void> {
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: { ...(await read()), [originOf(baseUrl)]: locationId } });
  },

  async remove(baseUrl: string): Promise<void> {
    const origin = originOf(baseUrl);
    const kept = Object.entries(await read()).filter(([k]) => k !== origin);
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: Object.fromEntries(kept) });
  },

  /** Identifiant mémorisé s'il est encore dans l'arbre ; sinon `null`, et l'entrée obsolète est retirée. */
  async resolve(baseUrl: string, knownIds: ReadonlySet<string>): Promise<string | null> {
    const id = await this.get(baseUrl);
    if (id === null) return null;
    if (knownIds.has(id)) return id;
    await this.remove(baseUrl);
    return null;
  },
};
