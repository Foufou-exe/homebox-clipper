import { amazonFrExtractor } from '@/content/merchants/amazon-fr/extractor';
import { downloadDocument } from '@/content/merchants/amazon-fr/download';
import { browser } from '@/platform';
import { fail, ok } from '@/shared/errors';
import { isMessage } from '@/shared/messages';

/**
 * Script injecté à la demande (scripting.executeScript, R9) dans l'onglet amazon.fr actif.
 * Il n'a accès ni au stockage ni à la configuration HomeBox (principe I).
 */
export default defineContentScript({
  matches: ['https://www.amazon.fr/*'],
  registration: 'runtime',
  main() {
    const flag = window as unknown as { __homeboxClipper?: boolean };
    if (flag.__homeboxClipper) return;
    flag.__homeboxClipper = true;

    browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || sender.tab !== undefined || !isMessage(raw)) return false;

      if (raw.type === 'amazon/extract') {
        const pageUrl = new URL(location.href);
        if (!amazonFrExtractor.isOrderPage(document)) {
          sendResponse(fail('NOT_AN_ORDER_PAGE'));
          return false;
        }
        const purchase = amazonFrExtractor.extract(document, pageUrl);
        void amazonFrExtractor
          .resolveDocuments(document, pageUrl, fetch.bind(window))
          .then((documents) => sendResponse(ok({ ...purchase, documents })))
          .catch(() => sendResponse(ok(purchase)));
        return true;
      }

      if (raw.type === 'amazon/download') {
        void downloadDocument(raw.url).then(sendResponse);
        return true;
      }
      return false;
    });
  },
});
