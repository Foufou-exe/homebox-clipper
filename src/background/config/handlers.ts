import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { hasOrigin } from '@/platform';
import { ALLOW_HTTP } from '@/shared/env';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView } from '@/shared/types';
import { configStore, isValidApiKey } from './config-store';
import { MIN_PASSPHRASE_LENGTH } from './key-vault';
import { normalizeBaseUrl } from './url-policy';

async function testConnection(baseUrl: string, apiKey: string): Promise<Result<{ version: string }>> {
  const client = createHomeBoxClient({ baseUrl, apiKey });
  const status = await client.getStatus();
  if (!status.ok) return status;
  const auth = await client.checkAuth();
  if (!auth.ok) return auth;
  return ok({ version: status.value.version });
}

async function recordCheck(result: Result<{ version: string }>): Promise<Result<ConfigView>> {
  const at = new Date().toISOString();
  await configStore.setLastCheck(
    result.ok ? { status: 'ok', version: result.value.version, at } : { status: 'error', code: result.error, at },
  );
  if (!result.ok) return fail(result.error, result.httpStatus);
  return ok(await configStore.getView());
}

export function registerConfigHandlers(): void {
  register('config/get', () => configStore.getView());

  register('config/save', async ({ baseUrl, apiKey, passphrase }) => {
    const url = normalizeBaseUrl(baseUrl, { dev: ALLOW_HTTP });
    if (!url.ok) return url;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) return fail('WEAK_PASSPHRASE');

    // Clé vide = conserver la clé actuelle, qu'il faut alors déchiffrer avec la phrase de passe :
    // changer l'URL d'une clé existante exige donc de connaître la phrase de passe.
    let key = apiKey.trim();
    if (key === '') {
      const current = await configStore.currentKey(passphrase);
      if (!current.ok) return current.error === 'NOT_CONFIGURED' ? fail('UNAUTHORIZED') : current;
      key = current.value;
    }
    if (!isValidApiKey(key)) return fail('UNAUTHORIZED');
    // La permission est demandée par l'UI (geste utilisateur) avant cet appel.
    if (!(await hasOrigin(url.value.origin))) return fail('PERMISSION_DENIED');

    const result = await testConnection(url.value.baseUrl, key);
    await configStore.save({ baseUrl: url.value.baseUrl, apiKey: key, passphrase });
    return recordCheck(result);
  });

  register('config/test', async () => {
    const creds = await configStore.getCredentials();
    if (!creds.ok) return creds;
    return recordCheck(await testConnection(creds.value.baseUrl, creds.value.apiKey));
  });

  register('config/delete', async () => {
    await configStore.delete();
    return ok(undefined);
  });

  register('session/unlock', async ({ passphrase }) => {
    const res = await configStore.unlock(passphrase);
    return res.ok ? ok(await configStore.getView()) : res;
  });

  register('session/lock', async () => {
    await configStore.lock();
    return configStore.getView();
  });
}
