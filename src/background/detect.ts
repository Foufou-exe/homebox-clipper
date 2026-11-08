import { MERCHANTS } from '@/content/merchants/registry';
import { browser } from '@/platform';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { sendToTab, type DetectResult } from '@/shared/messages';
import { register } from './router';

export const AMAZON_FR_SCRIPT = '/content-scripts/amazon-fr.js';

/** Idempotent injection (the script ignores a second run). Requires activeTab access. */
export async function injectExtractor(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [AMAZON_FR_SCRIPT] });
    return true;
  } catch {
    return false;
  }
}

/** Injects the extractor into the active tab (access granted by activeTab) and starts detection. */
export async function detect(tabId: number): Promise<Result<DetectResult>> {
  let url: URL;
  try {
    const tab = await browser.tabs.get(tabId);
    url = new URL(tab.url ?? '');
  } catch {
    return fail('NOT_AN_ORDER_PAGE');
  }
  if (!MERCHANTS.find((m) => m.matchesUrl(url))) return fail('NOT_AN_ORDER_PAGE');

  if (!(await injectExtractor(tabId))) return fail('NOT_AN_ORDER_PAGE');

  let res: Awaited<ReturnType<typeof sendToTab<'amazon/extract'>>>;
  try {
    res = await sendToTab(tabId, { type: 'amazon/extract' });
  } catch {
    return fail('NOT_AN_ORDER_PAGE');
  }
  if (!res?.ok) return res ?? fail('NOT_AN_ORDER_PAGE');

  const warnings: ErrorCode[] = [];
  if (!res.value.products.some((p) => p.name.value !== null)) warnings.push('PRODUCT_NOT_FOUND');
  if (res.value.documents.length === 0) warnings.push('INVOICE_MISSING');
  return ok({ purchase: res.value, warnings });
}

export function registerDetectHandlers(): void {
  register('detect/run', ({ tabId }) => detect(tabId));
}
