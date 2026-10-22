import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';

export const ORDER_URL = 'https://www.amazon.fr/your-orders/order-details?orderID=999-0000000-0000001';

export function fixtureHtml(name: string): string {
  return readFileSync(resolve(__dirname, '../fixtures/amazon-fr', name), 'utf8');
}

/** Charge une fixture dans un document happy-dom situé sur amazon.fr. */
export function loadFixture(name: string, url = ORDER_URL): { doc: Document; url: URL } {
  const window = new Window({ url });
  window.document.write(fixtureHtml(name));
  return { doc: window.document as unknown as Document, url: new URL(url) };
}
