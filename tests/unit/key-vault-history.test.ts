import {
  HISTORY_KEY_AAD,
  decryptApiKey,
  decryptSecrets,
  encryptApiKey,
  encryptSecrets,
} from '@/background/config/key-vault';
import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';
const FAST = 1_000;
const hek = () => crypto.getRandomValues(new Uint8Array(32));
const b64 = (b: Uint8Array) => bytesToBase64(b);

/** Derives the passphrase key directly with WebCrypto (same parameters as key-vault). */
async function derive(passphrase: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(salt) as Uint8Array<ArrayBuffer>,
      iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

describe('key-vault: history key sealed with the same derivation (R10.2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the EncryptedKey blob keeps exactly its format', async () => {
    const { encryptedKey } = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    expect(Object.keys(encryptedKey).sort()).toEqual([
      'ct',
      'iterations',
      'iv',
      'kdf',
      'salt',
      'v',
    ]);
    expect(encryptedKey).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: FAST });
  });

  it('a single PBKDF2 derivation to encrypt both secrets, and a single one to decrypt them', async () => {
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    const sealed = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    const opened = await decryptSecrets(sealed.encryptedKey, sealed.historyKey, PASS, URL);
    expect(opened?.apiKey).toBe(KEY);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('sealed history key = { iv, ct } only, own 12-byte IV, opened with the same salt and iterations', async () => {
    const raw = hek();
    const { encryptedKey, historyKey } = await encryptSecrets(KEY, raw, PASS, URL, FAST);
    expect(Object.keys(historyKey).sort()).toEqual(['ct', 'iv']);
    expect(base64ToBytes(historyKey.iv).length).toBe(12);
    expect(historyKey.iv).not.toBe(encryptedKey.iv);
    const k = await derive(PASS, encryptedKey.salt, encryptedKey.iterations);
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(historyKey.iv) as Uint8Array<ArrayBuffer>,
        additionalData: new TextEncoder().encode('homebox-clipper/history-key/v1'),
      },
      k,
      base64ToBytes(historyKey.ct) as Uint8Array<ArrayBuffer>,
    );
    expect(b64(new Uint8Array(plain))).toBe(b64(raw));
    expect(HISTORY_KEY_AAD).toBe('homebox-clipper/history-key/v1');
    expect(JSON.stringify(historyKey)).not.toContain(b64(raw));
  });

  it('round trip: the API key and the history key come back', async () => {
    const raw = hek();
    const s = await encryptSecrets(KEY, raw, PASS, URL, FAST);
    const opened = await decryptSecrets(s.encryptedKey, s.historyKey, PASS, URL);
    expect(opened?.apiKey).toBe(KEY);
    expect(opened?.history !== 'unreadable' && b64(opened!.history.key)).toBe(b64(raw));
    expect(opened?.created).toBeUndefined();
  });

  it('wrong passphrase: everything is null', async () => {
    const s = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    expect(await decryptSecrets(s.encryptedKey, s.historyKey, 'mauvaise phrase', URL)).toBeNull();
  });

  it("tampered history key: the API key is still returned, the history key is 'unreadable'", async () => {
    const s = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    const ct = base64ToBytes(s.historyKey.ct);
    ct[3] = (ct[3] ?? 0) ^ 0xff;
    for (const bad of [
      { ...s.historyKey, ct: b64(ct) },
      {},
      'chaine',
      { iv: 1, ct: 2 },
      { iv: '%%', ct: '%%' },
    ]) {
      const opened = await decryptSecrets(s.encryptedKey, bad, PASS, URL);
      expect(opened).toEqual({ apiKey: KEY, history: 'unreadable' });
    }
  });

  it('history key of the wrong length: unreadable', async () => {
    const s = await encryptSecrets(KEY, new Uint8Array(16), PASS, URL, FAST);
    expect(await decryptSecrets(s.encryptedKey, s.historyKey, PASS, URL)).toEqual({
      apiKey: KEY,
      history: 'unreadable',
    });
  });

  it('absent history key (configuration from before 012): API key returned, new key created with the same derivation', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    for (const absent of [undefined, null]) {
      const spy = vi.spyOn(crypto.subtle, 'deriveKey');
      const opened = await decryptSecrets(blob, absent, PASS, URL);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      expect(opened?.apiKey).toBe(KEY);
      expect(opened?.history !== 'unreadable' && opened!.history.key.length).toBe(32);
      expect(opened?.created).toBeDefined();
      // The created seal opens again with the same passphrase and gives the same key.
      const again = await decryptSecrets(blob, opened!.created, PASS, URL);
      expect(again?.history !== 'unreadable' && b64(again!.history.key)).toBe(
        opened?.history !== 'unreadable' && b64(opened!.history.key),
      );
    }
  });

  it('distinct secrets: the history key seal does not decrypt as the API key, and vice versa', async () => {
    const s = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    expect(
      await decryptApiKey(
        { ...s.encryptedKey, iv: s.historyKey.iv, ct: s.historyKey.ct },
        PASS,
        URL,
      ),
    ).toBeNull();
    const swapped = await decryptSecrets(
      s.encryptedKey,
      { iv: s.encryptedKey.iv, ct: s.encryptedKey.ct },
      PASS,
      URL,
    );
    expect(swapped).toEqual({ apiKey: KEY, history: 'unreadable' });
  });

  it('the existing encryptApiKey / decryptApiKey keep their behaviour (smoke test)', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, PASS, URL)).toBe(KEY);
    const s = await encryptSecrets(KEY, hek(), PASS, URL, FAST);
    expect(await decryptApiKey(s.encryptedKey, PASS, URL)).toBe(KEY);
  });
});
