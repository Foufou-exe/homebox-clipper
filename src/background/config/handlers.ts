import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { hasOrigin } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView, LastCheck } from '@/shared/types';
import * as autoLock from './auto-lock';
import { configStore } from './config-store';
import { instanceStore } from './instance-store';
import { normalizeBaseUrl, originOf } from './url-policy';

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

export function registerConfigHandlers(): void {
  register('config/get', () => configStore.getView());

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

  // Spec 016 (US4): management of one instance; every message names it, never a fallback to another one.
  register('instance/rename', async ({ instanceId, name }) => {
    const res = await configStore.renameInstance(instanceId, name);
    return res.ok ? ok(await configStore.getView()) : res;
  });

  // Contacts only this instance (getStatus + checkAuth) and records its last check (US4-3).
  register('instance/test', async ({ instanceId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    return recordCheck(creds.value.id, await testConnection(creds.value.baseUrl, creds.value.apiKey));
  });

  // Rules of the former single-instance save, per instance (US4-4): a new origin must have been granted by the UI (click);
  // the former origin is released once no instance uses it (US4-5). Saved even if the connection test fails.
  register('instance/update', async ({ instanceId, baseUrl, apiKey, passphrase, newPassphrase }) => {
    const url = normalizeBaseUrl(baseUrl);
    if (!url.ok) return url;
    const { origin } = url.value;
    let tested: Result<{ version: string }> | null = null;
    const before = await instanceStore.byId(instanceId);
    const changedOrigin = before !== null && originOf(before.baseUrl) !== origin;
    let res: Result<{ previousBaseUrl: string }>;
    try {
      res = await configStore.updateInstance(
        instanceId,
        { baseUrl: url.value.baseUrl, apiKey, passphrase, newPassphrase },
        {
          probe: async (target, key, previous) => {
            if (originOf(previous) !== origin && !(await hasOrigin(origin))) return fail('PERMISSION_DENIED');
            tested = await testConnection(target, key);
            return ok(toLastCheck(tested));
          },
        },
      );
    } catch (error) {
      if (changedOrigin) await instanceStore.releaseOriginIfUnused(origin);
      throw error;
    }
    if (!res.ok) {
      // A new origin granted for nothing is given back (never one still used by an instance).
      if (changedOrigin) await instanceStore.releaseOriginIfUnused(origin);
      return res;
    }
    const previous = originOf(res.value.previousBaseUrl);
    if (previous !== origin) await instanceStore.releaseOriginIfUnused(previous);
    return checkAnswer(tested ?? fail('BAD_MESSAGE'));
  });

  // US4-6 to US4-8: refused while an import to it runs; the last one is the global deletion.
  register('instance/delete', async ({ instanceId }) => {
    const res = await configStore.removeInstance(instanceId);
    return res.ok ? ok(await configStore.getView()) : res;
  });

  // US5-3: one passphrase for every key, changed atomically; `reenter`: ids of the keys to enter again.
  register('session/change-passphrase', async ({ current, next }) => {
    const res = await configStore.changePassphrase(current, next);
    return res.ok ? ok({ view: await configStore.getView(), reenter: res.value.reenter }) : res;
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
