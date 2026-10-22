import { fail, ok, type Result } from '@/shared/errors';

export interface NormalizedUrl {
  /** URL absolue sans `/` final ni chemin `/api`. */
  baseUrl: string;
  /** Origine utilisée pour la demande de permission. */
  origin: string;
  warning?: 'local_http';
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Normalise l'URL de l'instance HomeBox et applique la règle HTTPS (principe V) :
 * HTTPS obligatoire en production ; HTTP accepté en build de développement
 * ou pour une instance locale, avec avertissement.
 */
export function normalizeBaseUrl(input: string, { dev }: { dev: boolean }): Result<NormalizedUrl> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return fail('INVALID_URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('INVALID_URL');
  if (url.username || url.password) return fail('INVALID_URL');

  let warning: NormalizedUrl['warning'];
  if (url.protocol === 'http:') {
    if (!dev && !LOCAL_HOSTS.has(url.hostname)) return fail('INSECURE_URL');
    warning = 'local_http';
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/, '');
  const baseUrl = `${url.origin}${path}`;
  return ok(warning ? { baseUrl, origin: url.origin, warning } : { baseUrl, origin: url.origin });
}

export function originOf(baseUrl: string): string {
  return new URL(baseUrl).origin;
}
