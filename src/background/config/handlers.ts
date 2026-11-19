import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { hasOrigin } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView, LastCheck } from '@/shared/types';
import * as autoLock from './auto-lock';
import { configStore, isValidApiKey } from './config-store';
import { instanceStore } from './instance-store';
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

/** Last check recorded for a connection test result (shared by the configuration and instance handlers). */
function toLastCheck(result: Result<{ version: string }>): LastCheck {
  const at = new Date().toISOString();
  return result.ok ? { status: 'ok', version: result.value.version, at } : { status: 'error', code: result.error, at };
}

/** The answer of a connection test: the view on success, the test error otherwise (the check is saved anyway). */
async function checkAnswer(result: Result<{ version: string }>): Promise<Result<ConfigView>> {
  if (!result.ok) return fail(result.error, result.httpStatus);
  return ok(await configStore.getView());
}

async function recordCheck(instanceId: string, result: Result<{ version: string }>): Promise<Result<ConfigView>> {
  await configStore.setLastCheck(instanceId, toLastCheck(result));
  return checkAnswer(result);
}

/** Spec 016, increment 1: `config/save` and `config/test` stay aliases of the single instance. */
async function singleInstanceId(): Promise<string> {
  return (await instanceStore.read())?.instances[0]?.id ?? '';
}

export function registerConfigHandlers(): void {
  register('config/get', () => configStore.getView());

  register('config/save', async ({ baseUrl, apiKey, passphrase }) => {
    const url = normalizeBaseUrl(baseUrl);
    if (!url.ok) return url;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) return fail('WEAK_PASSPHRASE');

    // Empty key = keep the current key, which then has to be decrypted with the passphrase:
    // changing the URL of an existing key therefore requires knowing the passphrase.
    let key = apiKey.trim();
    if (key === '') {
      const current = await configStore.currentKey(passphrase);
      if (!current.ok) return current.error === 'NOT_CONFIGURED' ? fail('UNAUTHORIZED') : current;
      key = current.value;
    }
    if (!isValidApiKey(key)) return fail('UNAUTHORIZED');
    // The permission is requested by the UI (user gesture) before this call.
    if (!(await hasOrigin(url.value.origin))) return fail('PERMISSION_DENIED');

    const result = await testConnection(url.value.baseUrl, key);
    await configStore.save({ baseUrl: url.value.baseUrl, apiKey: key, passphrase });
    return recordCheck(await singleInstanceId(), result);
  });

  register('config/test', async () => {
    const creds = await configStore.getCredentials(await singleInstanceId());
    if (!creds.ok) return creds;
    return recordCheck(creds.value.id, await testConnection(creds.value.baseUrl, creds.value.apiKey));
  });

  // Spec 016 (US2): add an instance. The passphrase is always required (never kept in the session); the origin
  // permission is requested by the UI in the click, the service worker only checks it. Saved even if the
  // connection test fails (US2-5). Any refusal before saving releases the origin if no instance uses it.
  register('instance/add', async ({ baseUrl, apiKey, name, passphrase, newPassphrase }) => {
    const url = normalizeBaseUrl(baseUrl);
    if (!url.ok) return url;
    const { origin } = url.value;
    let tested: Result<{ version: string }> | null = null;
    let added: Result<{ id: string }>;
    try {
      added = await configStore.addInstance(
        { baseUrl: url.value.baseUrl, apiKey, name, passphrase, newPassphrase },
        {
          probe: async (target, key) => {
            if (!(await hasOrigin(origin))) return fail('PERMISSION_DENIED');
            tested = await testConnection(target, key);
            return ok(toLastCheck(tested));
          },
        },
      );
    } catch (error) {
      await instanceStore.releaseOriginIfUnused(origin);
      throw error;
    }
    if (!added.ok) {
      await instanceStore.releaseOriginIfUnused(origin);
      return added;
    }
    return checkAnswer(tested ?? fail('BAD_MESSAGE'));
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

  // 013: first load of the popup and the options page ("every open" lock, R3), then the same view as config/get.
  register('session/open', async () => {
    await autoLock.onOpen();
    return configStore.getView();
  });

  register('session/get-policy', () => configStore.getLockSettings());

  // Neither asks for the passphrase nor locks (FR-008); a write failure goes up as BAD_MESSAGE.
  register('session/set-policy', async ({ policy }) => ok(await configStore.setLockSettings(policy)));
}
