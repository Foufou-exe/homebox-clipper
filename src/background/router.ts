import { browser } from '@/platform';
import { logError } from '@/shared/logger';
import { isMessage, type MessageOf, type MessageType, type ResponseOf } from '@/shared/messages';

type Sender = { id?: string; url?: string; tab?: unknown };
type Handler<T extends MessageType> = (msg: MessageOf<T>) => Promise<ResponseOf<T>>;

const handlers = new Map<MessageType, Handler<MessageType>>();

/** Messages reserved for extension pages (popup, options), never for injected scripts. */
const UI_ONLY_PREFIXES = ['config/', 'session/', 'detect/', 'duplicate/', 'import/', 'location/'];

/**
 * True if the sender is an extension page (popup, options).
 * `sender.tab` is not enough: the options page opened in a tab also has a `tab`.
 * An injected script, on the other hand, has the URL of the host web page.
 */
function isExtensionPage(sender: Sender): boolean {
  return typeof sender.url === 'string' && sender.url.startsWith(browser.runtime.getURL('/'));
}

export function register<T extends MessageType>(type: T, handler: Handler<T>): void {
  handlers.set(type, handler as unknown as Handler<MessageType>);
}

/** Exposed for tests. */
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
    if (!isMessage(raw)) {
      // Malformed message: BAD_MESSAGE response, no handler executed (contracts/runtime-messages.md).
      sendResponse({ ok: false, error: 'BAD_MESSAGE' });
      return false;
    }
    if (!handlers.has(raw.type)) return false;
    void dispatch(raw, sender).then(sendResponse);
    return true;
  });
}
