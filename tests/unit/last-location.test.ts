import { fakeBrowser } from 'wxt/testing/fake-browser';
import { lastLocation } from '@/background/location/last-location';

const A = 'https://homebox.example.com';
const B = 'https://autre.example.com';
const raw = async () => (await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance;

describe('mémoire du dernier emplacement (R10, FR-020, FR-021)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('rien de mémorisé → null', async () => {
    expect(await lastLocation.get(A)).toBeNull();
  });

  it('écrit dans storage.local, clé lastLocationByInstance, par origine, identifiants seuls', async () => {
    await lastLocation.set(`${A}/sous/chemin`, 'loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
    // Aucune autre clé, aucun nom, aucune donnée d'achat.
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual(['lastLocationByInstance']);
  });

  it('une autre origine a sa propre entrée (US3-3)', async () => {
    await lastLocation.set(A, 'loc-1');
    await lastLocation.set(B, 'loc-2');
    expect(await lastLocation.get(A)).toBe('loc-1');
    expect(await lastLocation.get(B)).toBe('loc-2');
    await lastLocation.remove(A);
    expect(await raw()).toEqual({ [B]: 'loc-2' });
  });

  it('resolve : identifiant présent dans l’arbre → renvoyé, entrée conservée', async () => {
    await lastLocation.set(A, 'loc-1');
    expect(await lastLocation.resolve(A, new Set(['loc-1', 'x']))).toBe('loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });

  it('resolve : identifiant absent → null, entrée retirée, sans erreur (FR-020, scénario 20)', async () => {
    await lastLocation.set(A, 'loc-1');
    await lastLocation.set(B, 'loc-2');
    await expect(lastLocation.resolve(A, new Set(['x']))).resolves.toBeNull();
    expect(await raw()).toEqual({ [B]: 'loc-2' });
  });

  it('resolve : autre instance sans entrée → null', async () => {
    await lastLocation.set(A, 'loc-1');
    expect(await lastLocation.resolve(B, new Set(['loc-1']))).toBeNull();
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });

  it('une valeur corrompue en stockage est ignorée sans lever', async () => {
    await fakeBrowser.storage.local.set({ lastLocationByInstance: 'pas un objet' });
    expect(await lastLocation.get(A)).toBeNull();
    await lastLocation.set(A, 'loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });
});
