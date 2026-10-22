import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { hasOrigin } from '@/platform';
import { ALLOW_HTTP } from '@/shared/env';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView } from '@/shared/types';
import { configStore } from './config-store';
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

  register('config/save', async ({ baseUrl, apiKey }) => {
    const url = normalizeBaseUrl(baseUrl, { dev: ALLOW_HTTP });
    if (!url.ok) return url;
    const key = apiKey.trim();
    if (key === '' || /\s/.test(key)) return fail('UNAUTHORIZED');
    // La permission est demandée par l'UI (geste utilisateur) avant cet appel.
    if (!(await hasOrigin(url.value.origin))) return fail('PERMISSION_DENIED');

    const result = await testConnection(url.value.baseUrl, key);
    await configStore.save({ baseUrl: url.value.baseUrl, apiKey: key });
    return recordCheck(result);
  });

  register('config/test', async () => {
    const config = await configStore.getConfig();
    if (!config) return fail('NOT_CONFIGURED');
    return recordCheck(await testConnection(config.baseUrl, config.apiKey));
  });

  register('config/delete', async () => {
    await configStore.delete();
    return ok(undefined);
  });
}
