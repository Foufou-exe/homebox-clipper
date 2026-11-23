/**
 * Order page as an external link on the imported item (spec 025, data-model §1). Pure module shared by the service
 * worker and the pages: no storage, no network, nothing logged (the address is user data).
 */

export interface OrderLinkSettings {
  enabled: boolean;
}

/** Option off by default (FR-001). */
export const DEFAULT_ORDER_LINK_SETTINGS: Readonly<OrderLinkSettings> = { enabled: false };

/** Longest address accepted: well above the usual order pages, far below what a proxy would refuse. */
const MAX_URL_LENGTH = 2048;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Settings as stored and as sent by `order-link/set`: exactly `{ enabled: boolean }`. */
export function isOrderLinkSettings(x: unknown): x is OrderLinkSettings {
  return isRecord(x) && typeof x.enabled === 'boolean' && Object.keys(x).length === 1;
}

/**
 * Address of the order page that may be attached (C3, research R1): an absolute http(s) address with a host and no
 * embedded credentials, the same rules as HomeBox. Returned as received (no normalization: it must stay identical
 * to the address of the notes); `null` when it cannot be attached.
 */
export function orderLinkUrl(pageUrl: string | null | undefined): string | null {
  if (typeof pageUrl !== 'string' || pageUrl.length > MAX_URL_LENGTH || pageUrl !== pageUrl.trim())
    return null;
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return null;
  }
  const webAddress = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const clean = parsed.hostname !== '' && parsed.username === '' && parsed.password === '';
  return webAddress && clean ? pageUrl : null;
}
