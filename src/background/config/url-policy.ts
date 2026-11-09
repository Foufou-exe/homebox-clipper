import { fail, ok, type Result } from '@/shared/errors';

export interface NormalizedUrl {
  /** Absolute URL without a trailing `/` or `/api` path. */
  baseUrl: string;
  /** Origin used for the permission request. */
  origin: string;
  warning?: 'local_http';
}

/** Suffixes reserved for local networks (RFC 6762, RFC 8375, common homelab usage). */
const PRIVATE_SUFFIXES = ['.lan', '.local', '.home.arpa', '.internal', '.localhost'];

function privateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
  const [a, b] = parts.map(Number) as [number, number];
  return (
    a === 10 || // 10.0.0.0/8
    a === 127 || // boucle locale
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) // 192.168.0.0/16
  );
}

function privateIPv6(host: string): boolean {
  if (!host.startsWith('[')) return false;
  const ip = host.slice(1, -1).toLowerCase();
  return ip === '::1' || /^f[cd][0-9a-f]{2}:/.test(ip); // boucle locale, ULA fc00::/7
}

/**
 * Host reachable only from the local network: localhost, private IPs (RFC 1918, ULA),
 * local suffixes, or a dotless name (resolved by the local DNS).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost') return true;
  if (host.startsWith('[')) return privateIPv6(host);
  if (/^[\d.]+$/.test(host)) return privateIPv4(host);
  if (!host.includes('.')) return true;
  return PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Normalizes the HomeBox instance URL and applies the transport rule (principle V):
 * HTTPS is required for any public address; HTTP is accepted only on the private network,
 * with a warning (the API key travels in clear text there).
 */
export function normalizeBaseUrl(input: string): Result<NormalizedUrl> {
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
    if (!isPrivateHost(url.hostname)) return fail('INSECURE_URL');
    warning = 'local_http';
  }

  const path = trimTrailingSlashes(url.pathname).replace(/\/api(\/v1)?$/, '');
  const baseUrl = `${url.origin}${path}`;
  return ok(warning ? { baseUrl, origin: url.origin, warning } : { baseUrl, origin: url.origin });
}

/** Removes the trailing `/` characters in linear time (a `/\/+$/` regex backtracks quadratically). */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

export function originOf(baseUrl: string): string {
  return new URL(baseUrl).origin;
}
