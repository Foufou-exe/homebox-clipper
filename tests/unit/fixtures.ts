import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import { MERCHANTS } from '@/content/merchants/registry';
import type { MerchantExtractor } from '@/content/merchants/types';

/** Extractor of Amazon.fr, as registered for production (one per store). */
export function amazonFr(): MerchantExtractor {
  const ex = MERCHANTS.find((m) => m.id === 'amazon.fr');
  if (!ex) throw new Error('amazon.fr missing from the registry');
  return ex;
}

export const ORDER_URL =
  'https://www.amazon.fr/your-orders/order-details?orderID=999-0000000-0000001';

export function fixtureHtml(name: string, dir = 'amazon-fr'): string {
  return readFileSync(resolve(__dirname, '../fixtures', dir, name), 'utf8');
}

/** Loads a fixture into a happy-dom document located on `url` (amazon.fr by default). */
export function loadFixture(
  name: string,
  url = ORDER_URL,
  dir = 'amazon-fr',
): { doc: Document; url: URL } {
  const window = new Window({ url });
  window.document.write(fixtureHtml(name, dir));
  return { doc: window.document as unknown as Document, url: new URL(url) };
}

/** Fictional order details URL on the origin of a store (tests per store). */
export function storeOrderUrl(store: { origin: string }): string {
  return `${store.origin}/your-orders/order-details?orderID=999-0000000-0000001`;
}
