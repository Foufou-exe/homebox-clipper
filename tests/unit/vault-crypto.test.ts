import { fromLegacy } from '@/background/config/instance-store';
import { decryptApiKey, encryptSecrets, openHistoryKey } from '@/background/config/key-vault';
import {
  VAULT_CHECK_AAD,
  VAULT_CHECK_PLAIN,
  deriveVaultKey,
  newVault,
  openApiKeyWith,
  openCheck,
  openVault,
  rekeyVault,
  sealApiKeyWith,
  sealCheck,
} from '@/background/config/vault-crypto';
import { bytesToBase64 } from '@/shared/pdf';
import type { InstancesStore } from '@/shared/types';
import { A, B, FAST, PASSPHRASE, buildStore } from './instances-fixture';

/** Spec 016, Q-U2: one passphrase, N keys (contracts/vault-crypto.md). Fictitious values, 1 000 iterations. */

const C = {
  id: 'inst-c',
  name: 'Bureau',
  baseUrl: 'https://autre.example.net',
  apiKey: 'hb_cccccccc',
};
const WRONG = 'mauvaise phrase de test';
const hek = () => crypto.getRandomValues(new Uint8Array(32));
const tamper = (s: { iv: string; ct: string }) => ({ ...s, ct: `${s.ct.slice(0, -6)}AAAAAA` });

describe('vault-crypto: constants', () => {
  it('check seal constants (data-model)', () => {
    expect(VAULT_CHECK_AAD).toBe('homebox-clipper/vault-check/v1');
    expect(VAULT_CHECK_PLAIN).toBe('homebox-clipper vault v1');
  });

  it('newVault: PBKDF2-SHA256, 16-byte random salt, default 600 000 iterations', () => {
    const v = newVault();
    expect(v.kdf).toBe('PBKDF2-SHA256');
    expect(v.iterations).toBe(600_000);
    expect(atob(v.salt)).toHaveLength(16);
    expect(newVault(FAST).salt).not.toBe(newVault(FAST).salt);
  });

  it('the vault key is not extractable, encrypt/decrypt only', async () => {
    const key = await deriveVaultKey(PASSPHRASE, newVault(FAST));
    expect(key.extractable).toBe(false);
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeDefined();
  });
});

describe('vault-crypto: compatibility with the format of 0.6.0, both ways', () => {
  it('encryptSecrets blob → fromLegacy → openVault opens the API key and the history key', async () => {
    const history = hek();
    const sealed = await encryptSecrets(A.apiKey, history, PASSPHRASE, A.baseUrl, FAST);
    const store = fromLegacy({
      baseUrl: A.baseUrl,
      encryptedKey: sealed.encryptedKey,
      maskedKey: 'hb_••••xxxx',
      lastCheck: null,
      historyKey: sealed.historyKey,
    });
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.keys).toEqual({ migrated: A.apiKey });
    expect(opened?.unreadable).toEqual([]);
    expect(opened?.history).toEqual({ key: history });
    expect(opened?.created?.check).toBeDefined();
    expect(opened?.created?.historyKey).toBeUndefined();
  });

  it('a Sealed of sealApiKeyWith + salt/iterations of the vault is an EncryptedKey that decryptApiKey opens', async () => {
    const vault = newVault(FAST);
    const key = await deriveVaultKey(PASSPHRASE, vault);
    const sealed = await sealApiKeyWith(key, A.apiKey, A.baseUrl);
    expect(Object.keys(sealed).sort()).toEqual(['ct', 'iv']);
    const blob = {
      v: 1 as const,
      kdf: vault.kdf,
      iterations: vault.iterations,
      salt: vault.salt,
      ...sealed,
    };
    expect(await decryptApiKey(blob, PASSPHRASE, A.baseUrl)).toBe(A.apiKey);
  });
});

describe('vault-crypto: key bound to its address (FR-002)', () => {
  it('sealed for homebox.example.com, opened with inventaire.example.org → null (never throws)', async () => {
    const key = await deriveVaultKey(PASSPHRASE, newVault(FAST));
    const sealed = await sealApiKeyWith(key, A.apiKey, A.baseUrl);
    expect(await openApiKeyWith(key, sealed, A.baseUrl)).toBe(A.apiKey);
    expect(await openApiKeyWith(key, sealed, B.baseUrl)).toBeNull();
    expect(await openApiKeyWith(key, { iv: '!!', ct: '??' }, A.baseUrl)).toBeNull();
    expect(await openApiKeyWith(key, null as never, A.baseUrl)).toBeNull();
  });

  it('check seal: right key → true, other key or garbage → false', async () => {
    const key = await deriveVaultKey(PASSPHRASE, newVault(FAST));
    const other = await deriveVaultKey(WRONG, newVault(FAST));
    const check = await sealCheck(key);
    expect(await openCheck(key, check)).toBe(true);
    expect(await openCheck(other, check)).toBe(false);
    expect(await openCheck(key, { iv: 'x', ct: 'y' })).toBe(false);
    expect(await openCheck(key, 42)).toBe(false);
    expect(await openCheck(key, null)).toBe(false);
  });
});

describe('vault-crypto: openVault', () => {
  it('3 instances: right passphrase → 3 keys; wrong passphrase → null', async () => {
    const store = await buildStore({ instances: [A, B, C], historyKey: hek() });
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.keys).toEqual({ 'inst-a': A.apiKey, 'inst-b': B.apiKey, 'inst-c': C.apiKey });
    expect(opened?.unreadable).toEqual([]);
    expect(opened?.created).toBeUndefined();
    expect(await openVault(store, WRONG)).toBeNull();
  });

  it('ct of one instance tampered → unreadable: [id], the other 2 open (FR-022, US5-4)', async () => {
    const store = await buildStore({ instances: [A, B, C] });
    store.instances[1] = { ...store.instances[1]!, key: tamper(store.instances[1]!.key!) };
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.keys).toEqual({ 'inst-a': A.apiKey, 'inst-c': C.apiKey });
    expect(opened?.unreadable).toEqual(['inst-b']);
  });

  it('an instance whose stored address was changed cannot open its key (FR-002)', async () => {
    const store = await buildStore({ instances: [A, B] });
    store.instances[0] = { ...store.instances[0]!, baseUrl: 'https://attaquant.example.com' };
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.unreadable).toEqual(['inst-a']);
    expect(opened?.keys).toEqual({ 'inst-b': B.apiKey });
  });

  it('migrated vault without check: right passphrase → created.check, wrong → null', async () => {
    const store = await buildStore({ instances: [A], check: false });
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.created?.check).toBeDefined();
    expect(await openCheck(opened!.key, opened!.created!.check)).toBe(true);
    expect(await openVault(store, WRONG)).toBeNull();
  });

  it('a single instance without check and an unreadable key → null (WRONG_PASSPHRASE)', async () => {
    const store = await buildStore({ instances: [A], check: false });
    store.instances[0] = { ...store.instances[0]!, key: tamper(store.instances[0]!.key!) };
    expect(await openVault(store, PASSPHRASE)).toBeNull();
  });

  it('vault === null → null', async () => {
    const store: InstancesStore = {
      v: 1,
      vault: null,
      instances: [
        {
          id: 'migrated',
          name: 'h',
          baseUrl: A.baseUrl,
          key: null,
          maskedKey: 'm',
          lastCheck: null,
        },
      ],
    };
    expect(await openVault(store, PASSPHRASE)).toBeNull();
  });

  it('history key absent → created (sealed with the same derivation); unreadable → "unreadable"', async () => {
    const store = await buildStore({ instances: [A] });
    const opened = await openVault(store, PASSPHRASE);
    expect(opened?.history).not.toBe('unreadable');
    const created = opened!.created!.historyKey!;
    expect(await openHistoryKey(created, opened!.key)).toEqual(
      (opened!.history as { key: Uint8Array }).key,
    );

    const broken = { ...store, vault: { ...store.vault!, historyKey: { iv: 'x', ct: 'y' } } };
    const again = await openVault(broken, PASSPHRASE);
    expect(again?.history).toBe('unreadable');
    expect(again?.keys).toEqual({ 'inst-a': A.apiKey });
    expect(again?.created).toBeUndefined();
  });

  it('distinct IVs for every Sealed of the same vault (10 instances)', async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      name: `n${i}`,
      baseUrl: `https://h${i}.example.com`,
      apiKey: `hb_key_${i}_xxxxxx`,
    }));
    const store = await buildStore({ instances: seeds, historyKey: hek() });
    const ivs = [
      ...store.instances.map((i) => i.key!.iv),
      store.vault!.check!.iv,
      store.vault!.historyKey!.iv,
    ];
    expect(new Set(ivs).size).toBe(12);
  });

  it('a single derivation per openVault, 10 instances (invariant 4)', async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      name: `n${i}`,
      baseUrl: `https://h${i}.example.com`,
      apiKey: `hb_key_${i}_xxxxxx`,
    }));
    const store = await buildStore({ instances: seeds, historyKey: hek() });
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    const opened = await openVault(store, PASSPHRASE);
    expect(Object.keys(opened!.keys)).toHaveLength(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('vault-crypto: rekeyVault (pure, nothing written)', () => {
  it('new salt, everything resealed with fresh IVs; the old passphrase opens nothing, the new one opens everything', async () => {
    const history = hek();
    const store = await buildStore({ instances: [A, B, C], historyKey: history });
    const opened = (await openVault(store, PASSPHRASE))!;
    const snapshot = JSON.stringify(store);
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    const { store: next, reenter } = await rekeyVault(
      store,
      opened,
      'nouvelle phrase de test',
      FAST,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(store)).toBe(snapshot);
    expect(reenter).toEqual([]);
    expect(next.vault!.salt).not.toBe(store.vault!.salt);
    const oldIvs = new Set([
      ...store.instances.map((i) => i.key!.iv),
      store.vault!.check!.iv,
      store.vault!.historyKey!.iv,
    ]);
    for (const iv of [
      ...next.instances.map((i) => i.key!.iv),
      next.vault!.check!.iv,
      next.vault!.historyKey!.iv,
    ]) {
      expect(oldIvs.has(iv)).toBe(false);
    }
    expect(await openVault(next, PASSPHRASE)).toBeNull();
    const reopened = await openVault(next, 'nouvelle phrase de test');
    expect(reopened?.keys).toEqual({ 'inst-a': A.apiKey, 'inst-b': B.apiKey, 'inst-c': C.apiKey });
    expect(reopened?.history).toEqual({ key: history });
    expect(
      next.instances.map(({ id, name, baseUrl, maskedKey }) => ({ id, name, baseUrl, maskedKey })),
    ).toEqual(
      store.instances.map(({ id, name, baseUrl, maskedKey }) => ({ id, name, baseUrl, maskedKey })),
    );
  });

  it('a key already unreadable becomes key: null and is listed in reenter', async () => {
    const store = await buildStore({ instances: [A, B], historyKey: hek() });
    store.instances[1] = { ...store.instances[1]!, key: tamper(store.instances[1]!.key!) };
    const opened = (await openVault(store, PASSPHRASE))!;
    const { store: next, reenter } = await rekeyVault(
      store,
      opened,
      'nouvelle phrase de test',
      FAST,
    );
    expect(reenter).toEqual(['inst-b']);
    expect(next.instances[1]!.key).toBeNull();
    expect((await openVault(next, 'nouvelle phrase de test'))?.keys).toEqual({
      'inst-a': A.apiKey,
    });
  });

  it('nothing written in clear: no API key, no passphrase, no history key in the result', async () => {
    const history = hek();
    const store = await buildStore({ instances: [A, B], historyKey: history });
    const opened = (await openVault(store, PASSPHRASE))!;
    const { store: next } = await rekeyVault(store, opened, 'nouvelle phrase de test', FAST);
    const raw = JSON.stringify(next);
    for (const v of [
      A.apiKey,
      B.apiKey,
      PASSPHRASE,
      'nouvelle phrase de test',
      bytesToBase64(history),
    ]) {
      expect(raw).not.toContain(v);
    }
  });
});
