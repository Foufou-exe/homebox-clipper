import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  generateHistoryKey,
  importHistoryKey,
  open,
  seal,
} from '@/background/history/history-crypto';
import { createHistoryStore } from '@/background/history/history-store';
import { bytesToBase64 } from '@/shared/pdf';
import type { ImportDraft, ImportHistoryEntry, PendingImport } from '@/shared/types';
import { draft } from '../contract/orchestrator-harness';

const INSTANCE = 'https://homebox.example.com';
const T0 = Date.parse('2026-11-12T10:00:00.000Z');
const DAY = 86_400_000;

function pending(
  id: string,
  over: Partial<PendingImport> = {},
  d: Partial<ImportDraft> = {},
): PendingImport {
  return {
    id,
    tabId: 7,
    pageUrl: 'https://www.amazon.fr/your-orders/order-details',
    draft: draft(d),
    entityId: null,
    steps: {
      create: 'pending',
      update: 'pending',
      attachments: { 'detected-0': 'pending' },
      photo: 'not_requested',
    },
    status: 'running',
    error: null,
    photoError: null,
    photoAttempted: false,
    ...over,
  };
}
const done = (id: string, over: Partial<PendingImport> = {}) =>
  pending(id, {
    entityId: `ent-${id}`,
    status: 'success',
    steps: {
      create: 'done',
      update: 'done',
      attachments: { 'detected-0': 'done' },
      photo: 'not_requested',
    },
    ...over,
  });

const local = async () => fakeBrowser.storage.local.get(null);
const historyKeys = async () =>
  Object.keys(await local()).filter((k) => k.startsWith('importHistory:'));

async function setup(clockStart = T0) {
  fakeBrowser.reset();
  let now = clockStart;
  const active = new Set<string>();
  const raw = generateHistoryKey();
  const key = await importHistoryKey(raw);
  const store = createHistoryStore({ clock: () => now, isActive: (id) => active.has(id) });
  return {
    store,
    key,
    raw,
    active,
    setNow: (t: number) => {
      now = t;
    },
  };
}

/** Writes an entry with a chosen importedAt directly (sealed with the key). */
async function plant(
  key: CryptoKey,
  id: string,
  importedAt: string,
  over: Partial<ImportHistoryEntry> = {},
) {
  const entry: ImportHistoryEntry = {
    v: 1,
    id,
    importedAt,
    name: `Produit ${id}`,
    merchantId: 'amazon.fr',
    orderNumber: null,
    purchaseDate: null,
    instance: INSTANCE,
    entityId: `ent-${id}`,
    status: 'complete',
    missing: [],
    reason: null,
    ...over,
  };
  return { [`importHistory:${id}`]: await seal(entry, key, id) };
}

describe('history-store (Q-U5, Q-U9 to Q-U12)', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('start and update', () => {
    it('start writes an envelope of a running entry, importedAt = clock()', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      const env = (await local())['importHistory:a'];
      expect(Object.keys(env as object).sort()).toEqual(['ct', 'iv', 'v']);
      const entry = await open(env, key, 'a');
      expect(entry).toMatchObject({
        id: 'a',
        status: 'running',
        importedAt: new Date(T0).toISOString(),
        instance: INSTANCE,
      });
    });

    it('update rewrites a fresh envelope (new iv), keeping importedAt, instance and id', async () => {
      const { store, key, setNow } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      const first = (await local())['importHistory:a'] as { iv: string };
      setNow(T0 + DAY);
      await store.update(key, done('a'));
      const second = (await local())['importHistory:a'] as { iv: string };
      expect(second.iv).not.toBe(first.iv);
      expect(await open(second, key, 'a')).toMatchObject({
        id: 'a',
        status: 'complete',
        entityId: 'ent-a',
        importedAt: new Date(T0).toISOString(),
        instance: INSTANCE,
      });
    });

    it('update never creates: absent entry, disabled, deleted entry, entry that does not open', async () => {
      const { store, key } = await setup();
      await store.update(key, done('absent'));
      expect(await historyKeys()).toEqual([]);

      await store.start(key, pending('b'), INSTANCE);
      await store.remove('b');
      await store.update(key, done('b'));
      expect(await historyKeys()).toEqual([]);

      await store.start(key, pending('c'), INSTANCE);
      const other = await importHistoryKey(generateHistoryKey());
      const before = (await local())['importHistory:c'];
      await store.update(other, done('c'));
      expect((await local())['importHistory:c']).toEqual(before);

      await store.setEnabled(false);
      await store.start(key, pending('d'), INSTANCE);
      await store.update(key, done('d'));
      expect(await historyKeys()).toEqual([]);
    });
  });

  describe('no plaintext at rest (FR-014, Q-U28, Q-U29)', () => {
    it('after 10 imports and rewrites: only { v, iv, ct } envelopes, no clear value, the key never stored', async () => {
      const { store, key, raw } = await setup();
      for (let i = 0; i < 10; i++) {
        const id = `0000000${i}-uuid`;
        await store.start(
          key,
          pending(id, {}, { name: `Clavier sans fil Exemple Pro ${i}` }),
          INSTANCE,
        );
        await store.update(key, done(id, {}));
      }
      const all = await local();
      for (const k of Object.keys(all))
        expect(k === 'importHistorySettings' || /^importHistory:[\w-]+$/.test(k)).toBe(true);
      for (const k of await historyKeys())
        expect(Object.keys(all[k] as object).sort()).toEqual(['ct', 'iv', 'v']);
      const s = JSON.stringify(all);
      for (const v of [
        'Clavier',
        '999-0000000-0000001',
        'amazon.fr',
        'ent-',
        'homebox.example.com',
        'complete',
        'running',
        '2026-',
      ]) {
        expect(s).not.toContain(v);
      }
      expect(s).not.toContain(bytesToBase64(raw));
    });

    it('50 rewrites + 20 entries: all IVs distinct', async () => {
      const { store, key } = await setup();
      const ivs: string[] = [];
      await store.start(key, pending('same'), INSTANCE);
      for (let i = 0; i < 50; i++) {
        await store.update(
          key,
          pending('same', {
            status: i % 2 ? 'running' : 'partial',
            entityId: 'e',
            error: 'ATTACHMENT_FAILED',
          }),
        );
        ivs.push(((await local())['importHistory:same'] as { iv: string }).iv);
      }
      for (let i = 0; i < 20; i++) {
        await store.start(key, pending(`o${i}`), INSTANCE);
        ivs.push(((await local())[`importHistory:o${i}`] as { iv: string }).iv);
      }
      expect(new Set(ivs).size).toBe(70);
    });
  });

  describe('pruning at 12 months and 200 entries, injected clock (Q-U9)', () => {
    const iso = (t: number) => new Date(t).toISOString();
    const yearAgo = Date.parse('2025-11-12T10:00:00.000Z');

    it('at start: exactly 12 months kept, 12 months + 1 day removed', async () => {
      const { store, key } = await setup();
      await fakeBrowser.storage.local.set({
        ...(await plant(key, 'pile', iso(yearAgo))),
        ...(await plant(key, 'vieille', iso(yearAgo - DAY))),
      });
      await store.start(key, pending('new'), INSTANCE);
      expect((await historyKeys()).sort()).toEqual(['importHistory:new', 'importHistory:pile']);
    });

    it('end of month: 29 Feb 2028 minus 12 months = 28 Feb 2027', async () => {
      const { store, key } = await setup(Date.parse('2028-02-29T12:00:00.000Z'));
      await fakeBrowser.storage.local.set({
        ...(await plant(key, 'kept', '2027-02-28T12:00:00.000Z')),
        ...(await plant(key, 'gone', '2027-02-28T11:00:00.000Z')),
      });
      const view = await store.list(key);
      expect(view.entries.map((e) => e.id)).toEqual(['kept']);
      expect(await historyKeys()).toEqual(['importHistory:kept']);
    });

    it('the 201st removes the oldest', async () => {
      const { store, key } = await setup();
      let planted = {};
      for (let i = 0; i < 200; i++)
        planted = { ...planted, ...(await plant(key, `e${i}`, iso(T0 - (i + 1) * 60_000))) };
      await fakeBrowser.storage.local.set(planted);
      await store.start(key, pending('new'), INSTANCE);
      const keys = await historyKeys();
      expect(keys).toHaveLength(200);
      expect(keys).not.toContain('importHistory:e199');
      expect(keys).toContain('importHistory:new');
    });

    it('list alone prunes, without a new import', async () => {
      const { store, key, setNow } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      setNow(T0 + 400 * DAY);
      expect((await store.list(key)).entries).toEqual([]);
      expect(await historyKeys()).toEqual([]);
    });

    it('locked: no pruning (remove, clear and setEnabled read nothing)', async () => {
      const { store, key } = await setup();
      await fakeBrowser.storage.local.set(await plant(key, 'vieille', iso(yearAgo - DAY)));
      await store.remove('other');
      await store.setEnabled(true);
      expect(await historyKeys()).toEqual(['importHistory:vieille']);
    });
  });

  describe('list', () => {
    it('opens, removes unreadable entries, keeps future ones, sorts, reconciles, computes resumable', async () => {
      const { store, key, active, setNow } = await setup();
      await store.start(key, pending('older'), INSTANCE);
      setNow(T0 + 1000);
      await store.start(key, pending('activeRun'), INSTANCE);
      setNow(T0 + 2000);
      await store.start(key, pending('partial', { entityId: 'e' }), INSTANCE);
      await store.update(
        key,
        pending('partial', {
          entityId: 'e',
          status: 'partial',
          error: 'ATTACHMENT_FAILED',
          steps: {
            create: 'done',
            update: 'done',
            attachments: { 'detected-0': 'failed' },
            photo: 'not_requested',
          },
        }),
      );
      active.add('activeRun');
      const other = await importHistoryKey(generateHistoryKey());
      await fakeBrowser.storage.local.set({
        ...(await plant(other, 'foreign', new Date(T0).toISOString())),
        'importHistory:garbage': { v: 1, iv: 'x', ct: 'y' },
        'importHistory:future': { v: 2, blob: 'opaque' },
      });

      const view = await store.list(key, new Set(['partial', 'older']));
      expect(view.enabled).toBe(true);
      expect(view.entries.map((e) => e.id)).toEqual(['partial', 'activeRun', 'older']);
      expect(view.entries[0]).toMatchObject({ status: 'partial', resumable: true });
      expect(view.entries[1]).toMatchObject({ status: 'running', resumable: false });
      expect(view.entries[2]).toMatchObject({
        status: 'failed',
        interrupted: true,
        reason: null,
        resumable: true,
      });
      const keys = await historyKeys();
      expect(keys).not.toContain('importHistory:foreign');
      expect(keys).not.toContain('importHistory:garbage');
      expect(keys).toContain('importHistory:future');
      expect((await local())['importHistory:future']).toEqual({ v: 2, blob: 'opaque' });
      // Reconciliation is persisted.
      expect(await open((await local())['importHistory:older'], key, 'older')).toMatchObject({
        status: 'failed',
        interrupted: true,
      });
    });

    it('resumable is false for a complete entry, even with a pending', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      await store.update(key, done('a'));
      expect((await store.list(key, new Set(['a']))).entries[0]?.resumable).toBe(false);
    });
  });

  describe('concurrency (Q-U10)', () => {
    it('Promise.all of 20 start/update gives 20 consistent entries', async () => {
      const { store, key } = await setup();
      const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
      await Promise.all(
        ids.flatMap((id) => [store.start(key, pending(id), INSTANCE), store.update(key, done(id))]),
      );
      const view = await store.list(key);
      expect(view.entries).toHaveLength(20);
      expect(view.entries.every((e) => e.status === 'complete')).toBe(true);
    });

    it('remove during an update: no resurrection', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      await Promise.all([store.remove('a'), store.update(key, done('a'))]);
      expect(await historyKeys()).toEqual([]);
    });

    it('a failed operation does not block the next one', async () => {
      const { store, key } = await setup();
      const set = vi
        .spyOn(fakeBrowser.storage.local, 'set')
        .mockRejectedValueOnce(new Error('quota'));
      await expect(store.start(key, pending('a'), INSTANCE)).rejects.toThrow('quota');
      set.mockRestore();
      await store.start(key, pending('b'), INSTANCE);
      expect(await historyKeys()).toEqual(['importHistory:b']);
    });
  });

  describe('disable, clear, remove, settings (Q-U12)', () => {
    it('setEnabled(false) writes the setting then erases everything; start/update without effect', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      await store.setEnabled(false);
      expect(await historyKeys()).toEqual([]);
      expect((await local()).importHistorySettings).toEqual({ v: 1, enabled: false });
      expect(await store.isEnabled()).toBe(false);
      await store.start(key, pending('b'), INSTANCE);
      expect(await historyKeys()).toEqual([]);
      await store.setEnabled(true);
      expect(await store.isEnabled()).toBe(true);
      expect(await historyKeys()).toEqual([]);
    });

    it('entries present while disabled (interrupted disable): list erases them', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      await fakeBrowser.storage.local.set({ importHistorySettings: { v: 1, enabled: false } });
      expect(await store.list(key)).toEqual({ enabled: false, entries: [] });
      expect(await historyKeys()).toEqual([]);
    });

    it('clear removes every importHistory:* key (unreadable and v: 2 included) and keeps the setting', async () => {
      const { store, key } = await setup();
      await store.start(key, pending('a'), INSTANCE);
      await fakeBrowser.storage.local.set({
        'importHistory:garbage': 'x',
        'importHistory:future': { v: 2 },
        importHistorySettings: { v: 1, enabled: true },
        other: 1,
      });
      await store.clear();
      expect(await local()).toEqual({ importHistorySettings: { v: 1, enabled: true }, other: 1 });
    });

    it('remove of an absent key succeeds', async () => {
      const { store } = await setup();
      await expect(store.remove('nothing')).resolves.toBeUndefined();
    });

    it.each([
      [undefined],
      ['x'],
      [{ v: 1 }],
      [{ v: 1, enabled: 'no' }],
      [{ v: 2, enabled: false }],
    ])('isEnabled: absent, unreadable or invalid (%j) → true', async (value) => {
      const { store } = await setup();
      if (value !== undefined)
        await fakeBrowser.storage.local.set({ importHistorySettings: value });
      expect(await store.isEnabled()).toBe(true);
    });
  });

  it('forKey: writer bound to a captured key, start/update/reconcile', async () => {
    const { store, key } = await setup();
    const w = store.forKey(key);
    await w.start(pending('a', { entityId: 'e' }), INSTANCE);
    await w.reconcile(pending('a', { entityId: 'e' }));
    expect(await open((await local())['importHistory:a'], key, 'a')).toMatchObject({
      status: 'partial',
      interrupted: true,
    });
    await w.update(done('a'));
    expect(await open((await local())['importHistory:a'], key, 'a')).toMatchObject({
      status: 'complete',
    });
  });

  it('no network and no console output', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k),
    );
    const { store, key } = await setup();
    await store.start(key, pending('a'), INSTANCE);
    await store.update(key, done('a'));
    await store.list(key);
    await store.remove('a');
    await store.clear();
    await store.setEnabled(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
