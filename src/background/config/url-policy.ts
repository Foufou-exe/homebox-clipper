import { fail, ok, type Result } from '@/shared/errors';

export interface NormalizedUrl {
  /** URL absolue sans `/` final ni chemin `/api`. */
  baseUrl: string;
  /** Origine utilisée pour la demande de permission. */
  origin: string;
  warning?: 'local_http';
}

/** Suffixes réservés aux réseaux locaux (RFC 6762, RFC 8375, usage courant des homelabs). */
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
 * Hôte joignable uniquement depuis le réseau local : localhost, IP privées (RFC 1918, ULA),
 * suffixes locaux, ou nom sans point (résolu par le DNS local).
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
 * Normalise l'URL de l'instance HomeBox et applique la règle de transport (principe V) :
 * HTTPS obligatoire pour toute adresse publique ; HTTP accepté uniquement sur le réseau privé,
 * avec avertissement (la clé API y circule en clair).
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

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/, '');
  const baseUrl = `${url.origin}${path}`;
  return ok(warning ? { baseUrl, origin: url.origin, warning } : { baseUrl, origin: url.origin });
}

export function originOf(baseUrl: string): string {
  return new URL(baseUrl).origin;
}
