import { downloadDocument } from '@/content/merchants/amazon/download';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { MERCHANTS } from '@/content/merchants/registry';
import { browser } from '@/platform';
import { fail, ok } from '@/shared/errors';
import { isMessage } from '@/shared/messages';

/**
 * Script injected on demand (scripting.executeScript, R9) in the active tab of an Amazon store.
 * It has no access to storage or to the HomeBox configuration (principle I).
 */
export default defineContentScript({
  // Generated from the table of the stores (no duplicate list). These matches never reach the manifest:
  // the build hook removes the host_permissions WXT derives from them (wxt.config.ts, activeTab only).
  matches: AMAZON_STORES.map((s) => `${s.origin}/*`),
  registration: 'runtime',
  main() {
    const flag = window as unknown as { __homeboxClipper?: boolean };
    if (flag.__homeboxClipper) return;
    flag.__homeboxClipper = true;

    browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || sender.tab !== undefined || !isMessage(raw)) return false;

      // The store is always the one of the tab (exact origin), never a value read from the message.
      const pageUrl = new URL(location.href);
      const merchant = MERCHANTS.find((m) => m.matchesUrl(pageUrl));

      if (raw.type === 'amazon/extract') {
        if (!merchant || !merchant.isOrderPage(document, pageUrl)) {
          sendResponse(fail('NOT_AN_ORDER_PAGE'));
          return false;
        }
        const purchase = merchant.extract(document, pageUrl);
        void merchant
          .resolveDocuments(document, pageUrl, fetch.bind(window))
          .then((documents) => sendResponse(ok({ ...purchase, documents })))
          .catch(() => sendResponse(ok(purchase)));
        return true;
      }

      if (raw.type === 'amazon/download') {
        if (!merchant) {
          sendResponse(fail('DOWNLOAD_REFUSED'));
          return false;
        }
        // matchesUrl compares the exact origin: pageUrl.origin is the origin of the store (FR-008).
        void downloadDocument(raw.url, pageUrl.origin).then(sendResponse);
        return true;
      }
      return false;
    });
  },
});
