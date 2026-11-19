import { fakeBrowser } from 'wxt/testing/fake-browser';
import { maskKey } from '@/background/config/config-store';
import { encryptSecrets, sealHistoryKey } from '@/background/config/key-vault';
import {
  deriveVaultKey,
  newVault,
  sealApiKeyWith,
  sealCheck,
} from '@/background/config/vault-crypto';
import type { InstancesStore, StoredInstance } from '@/shared/types';

/**
 * Shared helpers of spec 016 (multiple HomeBox instances). Fictitious values only: no real address, no real key.
 * Not a test file (no `describe`).
 */

export const PASSPHRASE = 'phrase de test 123';
export const FAST = 1_000;

export interface InstanceSeed {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export const A: InstanceSeed = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  apiKey: 'hb_xxxxxxxx',
};
export const B: InstanceSeed = {
  id: 'inst-b',
  name: 'Atelier',
  baseUrl: 'https://inventaire.example.org',
  apiKey: 'hb_bbbbbbbb',
};

/** Builds a valid vault + instances (each key sealed with its own address as associated data), with a check seal. */
export async function buildStore({
  passphrase = PASSPHRASE,
  iterations = FAST,
  instances,
  historyKey,
  check = true,
}: {
  passphrase?: string;
  iterations?: number;
  instances: InstanceSeed[];
  historyKey?: Uint8Array;
  check?: boolean;
}): Promise<InstancesStore> {
  const vault = newVault(iterations);
  const key = await deriveVaultKey(passphrase, vault);
  const stored: StoredInstance[] = [];
  for (const i of instances) {
    stored.push({
      id: i.id,
      name: i.name,
      baseUrl: i.baseUrl,
      key: await sealApiKeyWith(key, i.apiKey, i.baseUrl),
      maskedKey: maskKey(i.apiKey),
      lastCheck: null,
    });
  }
  return {
    v: 1,
    vault: {
      ...vault,
      ...(check ? { check: await sealCheck(key) } : {}),
      ...(historyKey ? { historyKey: await sealHistoryKey(historyKey, key) } : {}),
    },
    instances: stored,
  };
}

export async function seedStore(store: InstancesStore): Promise<void> {
  await fakeBrowser.storage.local.set({ homeboxInstances: store });
}

export const LEGACY_URL = 'https://homebox.example.com';
export const LEGACY_KEY_VALUE = 'hb_xxxxxxxx';

/** Old single configuration (≤ 0.6.0), encrypted with `encryptSecrets`, written to `homeboxConfig`. */
export async function seedLegacy(
  passphrase: string = PASSPHRASE,
  apiKey: string = LEGACY_KEY_VALUE,
  historyKey: Uint8Array = crypto.getRandomValues(new Uint8Array(32)),
) {
  const sealed = await encryptSecrets(apiKey, historyKey, passphrase, LEGACY_URL, FAST);
  const legacy = {
    baseUrl: LEGACY_URL,
    encryptedKey: sealed.encryptedKey,
    maskedKey: 'hb_••••xxxx',
    lastCheck: null,
    historyKey: sealed.historyKey,
  };
  await fakeBrowser.storage.local.set({ homeboxConfig: legacy });
  return { legacy, historyKey };
}
