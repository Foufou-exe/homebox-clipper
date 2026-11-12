import {
  generateHistoryKey,
  importHistoryKey,
  open,
  seal,
} from '@/background/history/history-crypto';
import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';
import type { ImportHistoryEntry } from '@/shared/types';

const ID = '0b6c1f0e-2f8b-4a57-9d0a-000000000001';
const entry = (over: Partial<ImportHistoryEntry> = {}): ImportHistoryEntry => ({
  v: 1,
  id: ID,
  importedAt: '2026-11-12T10:00:00.000Z',
  name: 'Clavier sans fil Exemple Pro',
  merchantId: 'amazon.fr',
  orderNumber: '999-0000000-0000001',
  purchaseDate: '2026-10-22',
  instance: 'https://homebox.example.com',
  entityId: 'entity-0042',
  status: 'complete',
  missing: [],
  reason: null,
  ...over,
});

const key = async () => importHistoryKey(generateHistoryKey());

/** Encrypts arbitrary bytes with the right key and associated data, bypassing `seal`'s validation. */
async function rawSeal(raw: Uint8Array, k: CryptoKey, id = ID) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`importHistory:${id}`) },
    k,
    raw as Uint8Array<ArrayBuffer>,
  );
  return { v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

describe('history-crypto (FR-014, Q-U28 to Q-U30)', () => {
  it('generateHistoryKey: 32 random bytes, two calls differ', () => {
    const a = generateHistoryKey();
    const b = generateHistoryKey();
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(b));
  });

  it('importHistoryKey: non-extractable AES-GCM key', async () => {
    const k = await key();
    expect(k.extractable).toBe(false);
    expect(k.algorithm.name).toBe('AES-GCM');
    expect([...k.usages].sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('seal: exactly { v, iv, ct }, 12-byte IV, no metadata in clear', async () => {
    const env = await seal(entry(), await key(), ID);
    expect(Object.keys(env).sort()).toEqual(['ct', 'iv', 'v']);
    expect(env.v).toBe(1);
    expect(base64ToBytes(env.iv).length).toBe(12);
    const s = JSON.stringify(env);
    for (const v of [
      'Clavier',
      '999-0000000-0000001',
      'amazon.fr',
      'homebox.example.com',
      'entity-0042',
      'complete',
      '2026',
    ]) {
      expect(s).not.toContain(v);
    }
  });

  it('unique IV: 50 rewrites of one entry + 20 other entries = 70 distinct IVs; same content → different ct', async () => {
    const k = await key();
    const ivs = new Set<string>();
    const cts = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const env = await seal(entry(), k, ID);
      ivs.add(env.iv);
      cts.add(env.ct);
    }
    for (let i = 0; i < 20; i++) {
      const id = `id-${i}`;
      ivs.add((await seal(entry({ id }), k, id)).iv);
    }
    expect(ivs.size).toBe(70);
    expect(cts.size).toBe(50);
  });

  it('round trip: open(seal(c)) deep-equals c (with and without interrupted)', async () => {
    const k = await key();
    expect(await open(await seal(entry(), k, ID), k, ID)).toEqual(entry());
    const partial = entry({
      status: 'partial',
      missing: ['invoice'],
      reason: null,
      interrupted: true,
    });
    expect(await open(await seal(partial, k, ID), k, ID)).toEqual(partial);
  });

  describe('wrong key or tampered data: null, never an exception', () => {
    it('another key, a modified byte, another id', async () => {
      const k = await key();
      const env = await seal(entry(), k, ID);
      await expect(open(env, await key(), ID)).resolves.toBeNull();
      const ct = base64ToBytes(env.ct);
      ct[0] = (ct[0] ?? 0) ^ 1;
      await expect(open({ ...env, ct: bytesToBase64(ct) }, k, ID)).resolves.toBeNull();
      await expect(open(env, k, 'another-id')).resolves.toBeNull();
    });

    it('truncated or malformed envelopes', async () => {
      const k = await key();
      const env = await seal(entry(), k, ID);
      const cases: unknown[] = [
        { ...env, ct: env.ct.slice(0, 12) },
        { v: 1, ct: env.ct },
        { ...env, iv: bytesToBase64(new Uint8Array(11)) },
        { ...env, iv: '%%%not base64' },
        { ...env, ct: 42 },
        null,
        undefined,
        'string',
        [env.iv, env.ct],
        {},
      ];
      for (const c of cases) await expect(open(c, k, ID)).resolves.toBeNull();
    });

    it('valid ciphertext but invalid JSON or invalid content', async () => {
      const k = await key();
      const enc = (x: string) => rawSeal(new TextEncoder().encode(x), k);
      await expect(open(await enc('{not json'), k, ID)).resolves.toBeNull();
      const { name: _n, ...noName } = entry();
      void _n;
      const invalid: unknown[] = [
        noName,
        { ...entry(), name: '' },
        { ...entry(), name: 'x'.repeat(256) },
        { ...entry(), status: 'success' },
        { ...entry(), entityId: 42 },
        { ...entry(), missing: ['invoice', 'unknown'] },
        { ...entry(), reason: 'some free text' },
        { ...entry(), interrupted: false },
        { ...entry(), purchaseDate: '22/10/2026' },
        { ...entry(), importedAt: 'not a date' },
        { ...entry(), id: 'another-id' },
        { ...entry(), price: 99.99 },
        null,
        [],
      ];
      for (const c of invalid)
        await expect(open(await enc(JSON.stringify(c)), k, ID)).resolves.toBeNull();
    });
  });

  it("later version: envelope v: 2, or content v: 2 → 'future'", async () => {
    const k = await key();
    const env = await seal(entry(), k, ID);
    await expect(open({ ...env, v: 2 }, k, ID)).resolves.toBe('future');
    await expect(open({ v: 2, data: 'opaque' }, k, ID)).resolves.toBe('future');
    const v2 = await rawSeal(
      new TextEncoder().encode(JSON.stringify({ ...entry(), v: 2, extra: true })),
      k,
    );
    await expect(open(v2, k, ID)).resolves.toBe('future');
  });
});
