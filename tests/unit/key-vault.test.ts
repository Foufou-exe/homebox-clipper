import { DEFAULT_ITERATIONS, decryptApiKey, encryptApiKey } from '@/background/config/key-vault';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'correct horse battery staple';
const FAST = 1_000; // reduced iterations for test speed

describe('key-vault', () => {
  it('encrypts then decrypts with the right passphrase', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, PASS, URL)).toBe(KEY);
  });

  it('the blob does not contain the plaintext key', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    const serialized = JSON.stringify(blob);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain(btoa(KEY));
    expect(blob).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: FAST });
  });

  it('wrong passphrase → null', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, 'mauvaise phrase', URL)).toBeNull();
  });

  it("modified URL (hijacking attempt) → null", async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, PASS, 'https://attaquant.example.com')).toBeNull();
  });

  it('tampered ciphertext → null', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    const ct = atob(blob.ct);
    const tampered = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
    expect(await decryptApiKey({ ...blob, ct: tampered }, PASS, URL)).toBeNull();
  });

  it('random salt and IV: two encryptions differ', async () => {
    const a = await encryptApiKey(KEY, PASS, URL, FAST);
    const b = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('600,000 PBKDF2 iterations by default', () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
  });
});
