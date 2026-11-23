import { fakeBrowser } from 'wxt/testing/fake-browser';
import { collectionSettings } from '@/background/collections/settings';
import { configStore } from '@/background/config/config-store';
import { COLLECTION_KEY, instanceStore } from '@/background/config/instance-store';
import type { CollectionSetting } from '@/shared/collections';
import { A, B, PASSPHRASE, buildStore, seedStore } from './instances-fixture';

/**
 * Collection setting per instance (spec 024, contracts/storage.md): storage bound to the address, compare-and-write in
 * the configuration queue, purge, credentials and view. Fictitious values only.
 */
const KEY = 'collectionByInstance';
const ID_M = '11111111-1111-4111-8111-111111111111';
const ID_W = '22222222-2222-4222-8222-222222222222';
const CHOSEN: CollectionSetting = {
  chosen: { id: ID_W, name: 'Atelier' },
  seen: { id: ID_W, name: 'Atelier', several: true },
};
const DEFAULT_SEEN: CollectionSetting = {
  chosen: null,
  seen: { id: ID_M, name: 'Maison', several: true },
};
const raw = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];
const seed = (table: Record<string, unknown>) => fakeBrowser.storage.local.set({ [KEY]: table });
const write = (id: string, baseUrl: string, s: CollectionSetting) =>
  collectionSettings.update(id, baseUrl, () => s);

beforeEach(async () => {
  fakeBrowser.reset();
  await seedStore(await buildStore({ instances: [A, B] }));
});
afterEach(() => vi.restoreAllMocks());

describe('collectionSettings (storage.local, collectionByInstance)', () => {
  it('COLLECTION_KEY is collectionByInstance', () => {
    expect(COLLECTION_KEY).toBe(KEY);
  });

  it('nothing stored → none (default collection of the key); no write on read (FR-013)', async () => {
    expect(await collectionSettings.entry('inst-a', A.baseUrl)).toEqual({ kind: 'none' });
    expect(await raw()).toBeUndefined();
  });

  it('update writes the setting with the address of the instance; two instances independent; local only', async () => {
    expect(await write('inst-a', A.baseUrl, CHOSEN)).toBe(true);
    await write('inst-b', B.baseUrl, DEFAULT_SEEN);
    expect(await collectionSettings.entry('inst-a', A.baseUrl)).toEqual({
      kind: 'ok',
      setting: CHOSEN,
    });
    expect(await raw()).toEqual({
      'inst-a': { ...CHOSEN, baseUrl: A.baseUrl },
      'inst-b': { ...DEFAULT_SEEN, baseUrl: B.baseUrl },
    });
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('only the declared properties are written', async () => {
    await write('inst-a', A.baseUrl, {
      chosen: { id: ID_W, name: 'Atelier', currency: 'EUR' },
      seen: null,
    } as never);
    expect(await raw()).toEqual({
      'inst-a': { chosen: { id: ID_W, name: 'Atelier' }, seen: null, baseUrl: A.baseUrl },
    });
  });

  it('an entry read on another address is none: a moved instance goes back to the default (FR-011, M1)', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    expect(await collectionSettings.entry('inst-a', 'https://autre.example.net')).toEqual({
      kind: 'none',
    });
  });

  it.each([
    ['a string', 'x'],
    [
      'a non-UUID id',
      { chosen: { id: 'pas-un-uuid', name: 'Atelier' }, seen: null, baseUrl: A.baseUrl },
    ],
    ['no address', { ...CHOSEN }],
  ])('stored entry %s → invalid (M3)', async (_label, value) => {
    await seed({ 'inst-a': value });
    expect(await collectionSettings.entry('inst-a', A.baseUrl)).toEqual({ kind: 'invalid' });
  });

  it('a table that is not an object → none, never an exception', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: [CHOSEN] });
    expect(await collectionSettings.entry('inst-a', A.baseUrl)).toEqual({ kind: 'none' });
  });

  it('update: fn receives the entry read inside the queue; null writes nothing', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    const fn = vi.fn(() => null);
    expect(await collectionSettings.update('inst-a', A.baseUrl, fn)).toBe(true);
    expect(fn).toHaveBeenCalledWith({ kind: 'ok', setting: CHOSEN });
    expect(await raw()).toEqual({ 'inst-a': { ...CHOSEN, baseUrl: A.baseUrl } });
  });

  it('update: unknown instance or other address → fn not called, nothing written (M1)', async () => {
    const fn = vi.fn(() => CHOSEN);
    expect(await collectionSettings.update('inconnue', A.baseUrl, fn)).toBe(false);
    expect(await collectionSettings.update('inst-a', 'https://autre.example.net', fn)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(await raw()).toBeUndefined();
  });

  it('two concurrent updates are serialised: the second sees the first (no stale read, M1)', async () => {
    const seen: string[] = [];
    await Promise.all([
      collectionSettings.update('inst-a', A.baseUrl, (e) => {
        seen.push(e.kind);
        return CHOSEN;
      }),
      collectionSettings.update('inst-a', A.baseUrl, (e) => {
        seen.push(e.kind);
        return null;
      }),
    ]);
    expect(seen).toEqual(['none', 'ok']);
  });
});

describe('purge with the instance and the configuration (FR-012)', () => {
  it('instanceStore.remove(A): the entry of A leaves, B stays', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    await write('inst-b', B.baseUrl, DEFAULT_SEEN);
    await instanceStore.remove('inst-a');
    expect(await raw()).toEqual({ 'inst-b': { ...DEFAULT_SEEN, baseUrl: B.baseUrl } });
  });

  it('instanceStore.clear(): the whole key is removed', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    await instanceStore.clear();
    expect(await fakeBrowser.storage.local.get(KEY)).toEqual({});
  });

  it('configStore.delete(): the key is removed with every instance', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    await configStore.delete();
    expect(await fakeBrowser.storage.local.get(KEY)).toEqual({});
  });

  it('update vs instanceStore.remove: no orphan entry (same write queue)', async () => {
    const removal = instanceStore.remove('inst-a');
    const set = write('inst-a', A.baseUrl, CHOSEN);
    await Promise.all([set, removal]);
    expect((await raw()) ?? {}).not.toHaveProperty('inst-a');
  });
});

describe('credentials and view (FR-002, FR-005, FR-014, M3)', () => {
  beforeEach(async () => {
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    await configStore.unlock(PASSPHRASE);
  });

  it('default setting: the credentials have no tenant (exactly as before)', async () => {
    const expected = { ok: true, value: { id: 'inst-a', baseUrl: A.baseUrl, apiKey: A.apiKey } };
    expect(await configStore.getCredentials('inst-a')).toEqual(expected);
    await write('inst-a', A.baseUrl, DEFAULT_SEEN);
    expect(await configStore.getCredentials('inst-a')).toEqual(expected);
  });

  it('chosen collection: tenant and collection, for this instance only', async () => {
    await write('inst-a', A.baseUrl, CHOSEN);
    expect(await configStore.getCredentials('inst-a')).toEqual({
      ok: true,
      value: {
        id: 'inst-a',
        baseUrl: A.baseUrl,
        apiKey: A.apiKey,
        tenant: ID_W,
        collection: { id: ID_W, name: 'Atelier' },
      },
    });
    expect(await configStore.getCredentials('inst-b')).toEqual({
      ok: true,
      value: { id: 'inst-b', baseUrl: B.baseUrl, apiKey: B.apiKey },
    });
  });

  it('unreadable entry: getCredentials refuses with COLLECTION_UNAVAILABLE (never the default); the key credentials still work', async () => {
    await seed({
      'inst-a': { chosen: { id: 'pas-un-uuid', name: 'Atelier' }, seen: null, baseUrl: A.baseUrl },
    });
    expect(await configStore.getCredentials('inst-a')).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(await configStore.getKeyCredentials('inst-a')).toEqual({
      ok: true,
      value: { id: 'inst-a', baseUrl: A.baseUrl, apiKey: A.apiKey },
    });
  });

  it('view: `collection` only for a readable entry, `collectionInvalid` for an unreadable one; readable while locked', async () => {
    await write('inst-b', B.baseUrl, CHOSEN);
    const view = await configStore.getView();
    expect(view.instances?.[0]).not.toHaveProperty('collection');
    expect(view.instances?.[0]).not.toHaveProperty('collectionInvalid');
    expect(view.instances?.[1]?.collection).toEqual(CHOSEN);
    await configStore.lock();
    expect((await configStore.getView()).instances?.[1]?.collection).toEqual(CHOSEN);
    await seed({ 'inst-a': 'x' });
    expect((await configStore.getView()).instances?.[0]?.collectionInvalid).toBe(true);
  });
});
