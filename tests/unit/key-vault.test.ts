import { DEFAULT_ITERATIONS, decryptApiKey, encryptApiKey } from '@/background/config/key-vault';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'correct horse battery staple';
const FAST = 1_000; // itérations réduites pour la vitesse des tests

describe('key-vault', () => {
  it('chiffre puis déchiffre avec la bonne phrase de passe', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, PASS, URL)).toBe(KEY);
  });

  it('le blob ne contient pas la clé en clair', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    const serialized = JSON.stringify(blob);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain(btoa(KEY));
    expect(blob).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: FAST });
  });

  it('mauvaise phrase de passe → null', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, 'mauvaise phrase', URL)).toBeNull();
  });

  it("URL modifiée (tentative de détournement) → null", async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(await decryptApiKey(blob, PASS, 'https://attaquant.example.com')).toBeNull();
  });

  it('chiffré altéré → null', async () => {
    const blob = await encryptApiKey(KEY, PASS, URL, FAST);
    const ct = atob(blob.ct);
    const tampered = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
    expect(await decryptApiKey({ ...blob, ct: tampered }, PASS, URL)).toBeNull();
  });

  it('sel et IV aléatoires : deux chiffrements diffèrent', async () => {
    const a = await encryptApiKey(KEY, PASS, URL, FAST);
    const b = await encryptApiKey(KEY, PASS, URL, FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('600 000 itérations PBKDF2 par défaut', () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
  });
});
