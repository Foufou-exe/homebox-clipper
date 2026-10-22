/**
 * Couche plateforme (principe VI) : seul point d'import de l'API navigateur dans src/.
 */
import { browser } from 'wxt/browser';

export { browser };

const pattern = (origin: string) => `${origin}/*`;

/** Doit être appelé depuis un geste utilisateur (clic) dans une page de l'extension. */
export function requestOrigin(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [pattern(origin)] });
}

export function hasOrigin(origin: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [pattern(origin)] });
}

export async function removeOrigin(origin: string): Promise<void> {
  await browser.permissions.remove({ origins: [pattern(origin)] });
}
