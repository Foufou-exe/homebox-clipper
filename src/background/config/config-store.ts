import { browser, removeOrigin } from '@/platform';
import type { ConfigView, HomeBoxConfig, LastCheck } from '@/shared/types';
import { originOf } from './url-policy';

const KEY = 'homeboxConfig';
export const PENDING_PREFIX = 'pendingImport:';

export function maskKey(apiKey: string): string {
  if (apiKey.length < 8) return '••••';
  return `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
}

/**
 * Stockage de la configuration HomeBox (R12).
 * `getConfig` (avec la clé) est réservé au service worker ; l'UI ne reçoit que `getView`.
 */
export const configStore = {
  async getConfig(): Promise<HomeBoxConfig | null> {
    const stored = await browser.storage.local.get(KEY);
    return (stored[KEY] as HomeBoxConfig | undefined) ?? null;
  },

  async getView(): Promise<ConfigView> {
    const config = await this.getConfig();
    if (!config) return { configured: false };
    return {
      configured: true,
      baseUrl: config.baseUrl,
      maskedKey: maskKey(config.apiKey),
      lastCheck: config.lastCheck,
    };
  },

  async save({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }): Promise<void> {
    if (apiKey.trim() === '' || /\s/.test(apiKey)) {
      throw new Error('clé API invalide');
    }
    const config: HomeBoxConfig = { baseUrl, apiKey, lastCheck: null };
    await browser.storage.local.set({ [KEY]: config });
  },

  async setLastCheck(lastCheck: LastCheck): Promise<void> {
    const config = await this.getConfig();
    if (!config) return;
    await browser.storage.local.set({ [KEY]: { ...config, lastCheck } });
  },

  async delete(): Promise<void> {
    const config = await this.getConfig();
    await browser.storage.local.remove(KEY);
    if (config) {
      try {
        await removeOrigin(originOf(config.baseUrl));
      } catch {
        // permission déjà absente
      }
    }
    const session = await browser.storage.session.get(null);
    const pendingKeys = Object.keys(session).filter((k) => k.startsWith(PENDING_PREFIX));
    if (pendingKeys.length) await browser.storage.session.remove(pendingKeys);
  },
};
