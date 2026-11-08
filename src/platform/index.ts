/**
 * Platform layer (principle VI): the only import point for the browser API in src/.
 */
import { browser } from 'wxt/browser';

export { browser };

const pattern = (origin: string) => `${origin}/*`;

/** Must be called from a user gesture (click) in an extension page. */
export function requestOrigin(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [pattern(origin)] });
}

export function hasOrigin(origin: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [pattern(origin)] });
}

export async function removeOrigin(origin: string): Promise<void> {
  await browser.permissions.remove({ origins: [pattern(origin)] });
}
