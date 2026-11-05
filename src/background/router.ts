import { browser } from '@/platform';
import { logError } from '@/shared/logger';
import { isMessage, type MessageOf, type MessageType, type ResponseOf } from '@/shared/messages';

type Sender = { id?: string; url?: string; tab?: unknown };
type Handler<T extends MessageType> = (msg: MessageOf<T>) => Promise<ResponseOf<T>>;

const handlers = new Map<MessageType, Handler<MessageType>>();

/** Messages réservés aux pages de l'extension (popup, options), jamais aux scripts injectés. */
const UI_ONLY_PREFIXES = ['config/', 'session/', 'detect/', 'duplicate/', 'import/', 'location/'];

/**
 * Vrai si l'expéditeur est une page de l'extension (popup, options).
 * `sender.tab` ne suffit pas : la page d'options ouverte dans un onglet a aussi un `tab`.
 * Un script injecté, lui, a l'URL de la page web hôte.
 */
function isExtensionPage(sender: Sender): boolean {
  return typeof sender.url === 'string' && sender.url.startsWith(browser.runtime.getURL('/'));
}

export function register<T extends MessageType>(type: T, handler: Handler<T>): void {
  handlers.set(type, handler as unknown as Handler<MessageType>);
}

/** Exposé pour les tests. */
export async function dispatch(raw: unknown, sender: Sender): Promise<unknown> {
  if (!isMessage(raw)) return { ok: false, error: 'BAD_MESSAGE' };
  if (sender.id !== undefined && sender.id !== browser.runtime.id) {
    return { ok: false, error: 'BAD_MESSAGE' };
  }
  if (UI_ONLY_PREFIXES.some((p) => raw.type.startsWith(p)) && !isExtensionPage(sender)) {
    return { ok: false, error: 'BAD_MESSAGE' };
  }
  const handler = handlers.get(raw.type);
  if (!handler) return undefined;
  try {
    return await handler(raw);
  } catch {
    logError('handler threw', { endpoint: raw.type });
    return { ok: false, error: 'BAD_MESSAGE' };
  }
}

export function startRouter(): void {
  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    if (!isMessage(raw) || !handlers.has(raw.type)) return false;
    void dispatch(raw, sender).then(sendResponse);
    return true;
  });
}
