import { fakeBrowser } from 'wxt/testing/fake-browser';
import { instanceStore } from '@/background/config/instance-store';
import { lastEntityType } from '@/background/entity-types/last-entity-type';
import { A, B, buildStore, seedStore } from './instances-fixture';

/** Last entity type used per instance (spec 023, data-model §3). Fictitious values only. */
const KEY = 'lastEntityTypeByInstance';
const read = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];

beforeEach(() => fakeBrowser.reset());

describe('lastEntityType', () => {
  it('the key is lastEntityTypeByInstance and is exported by the instance store and the config store', async () => {
    const { ENTITY_TYPE_KEY } = await import('@/background/config/instance-store');
    expect(ENTITY_TYPE_KEY).toBe(KEY);
    const cfg = await import('@/background/config/config-store');
    expect(cfg.ENTITY_TYPE_KEY).toBe(KEY);
  });

  it('set then get, per instance', async () => {
    await lastEntityType.set('inst-a', 'et-1');
    await lastEntityType.set('inst-b', 'et-2');
    expect(await lastEntityType.get('inst-a')).toBe('et-1');
    expect(await lastEntityType.get('inst-b')).toBe('et-2');
    expect(await lastEntityType.get('inst-c')).toBeNull();
  });

  it('set(null) removes the entry of this instance only, and writes nothing when there is none', async () => {
    await lastEntityType.set('inst-a', 'et-1');
    await lastEntityType.set('inst-b', 'et-2');
    await lastEntityType.set('inst-a', null);
    expect(await read()).toEqual({ 'inst-b': 'et-2' });
    await fakeBrowser.storage.local.remove(KEY);
    await lastEntityType.set('inst-a', null);
    expect(await read()).toBeUndefined();
  });

  it('a corrupted table or entry is ignored', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: 'oops' });
    expect(await lastEntityType.get('inst-a')).toBeNull();
    await fakeBrowser.storage.local.set({
      [KEY]: { 'inst-a': 12, 'inst-b': '', 'inst-c': 'x'.repeat(65), 'inst-d': 'et-4' },
    });
    expect(await lastEntityType.get('inst-a')).toBeNull();
    expect(await lastEntityType.get('inst-b')).toBeNull();
    expect(await lastEntityType.get('inst-c')).toBeNull();
    expect(await lastEntityType.get('inst-d')).toBe('et-4');
  });

  it('resolve keeps a known id and erases an unknown one', async () => {
    await lastEntityType.set('inst-a', 'et-1');
    expect(await lastEntityType.resolve('inst-a', new Set(['et-1']))).toBe('et-1');
    expect(await lastEntityType.resolve('inst-a', new Set(['et-9']))).toBeNull();
    expect(await lastEntityType.get('inst-a')).toBeNull();
  });

  it('is purged with the instance (remove) and with the configuration (clear)', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    await fakeBrowser.storage.local.set({ [KEY]: { [A.id]: 'et-1', [B.id]: 'et-2' } });
    await instanceStore.remove(B.id);
    expect(await read()).toEqual({ [A.id]: 'et-1' });
    await instanceStore.clear();
    expect(await fakeBrowser.storage.local.get(KEY)).toEqual({});
  });
});
