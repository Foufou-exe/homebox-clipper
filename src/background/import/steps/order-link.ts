import type { EntityOut } from '@/background/homebox/types';
import { storeForPageUrl } from '@/content/merchants/catalog';
import { getMessage } from '@/platform/i18n';
import type { ErrorCode } from '@/shared/errors';
import { orderLinkUrl } from '@/shared/order-link';
import type { ImportDraft, PendingImport } from '@/shared/types';
import type { StepContext } from './context';

/**
 * Spec 025 (research R3): an external link attachment (`mimeType` `link/url`) with exactly this address is already on the
 * item. HomeBox does not de-duplicate links, so a resume checks before sending again.
 */
const linkPresent = (read: EntityOut, url: string): boolean =>
  (read.attachments ?? []).some((a) => a.mimeType === 'link/url' && a.path === url);

/** Spec 025 (FR-008): localized title, the merchant name (or the host of the address), never the order number. */
function orderLinkTitle(draft: ImportDraft, url: string): string {
  const name = storeForPageUrl(draft.pageUrl)?.displayName ?? new URL(url).hostname;
  return getMessage('orderLink.title', [name]).slice(0, 255);
}

/** Records the outcome of the order link step (spec 025) and returns the error to report. */
async function settleOrderLink(
  ctx: StepContext,
  p: PendingImport,
  error: ErrorCode | null,
): Promise<ErrorCode | null> {
  p.steps.orderLink = error ? 'failed' : 'done';
  await ctx.persist(p);
  return error;
}

/**
 * Error of a failed POST of the link (spec 025, C6, FR-011): a 404 may come from an instance without the route or from
 * a deleted item; the item is read again to tell them apart. Any other failure is `ORDER_LINK_FAILED`.
 */
async function orderLinkFailure(
  ctx: StepContext,
  entityId: string,
  httpStatus: number | undefined,
): Promise<ErrorCode> {
  if (httpStatus !== 404) return 'ORDER_LINK_FAILED';
  const read = await ctx.client.getEntity(entityId);
  return read.ok ? 'ORDER_LINK_UNSUPPORTED' : 'ORDER_LINK_FAILED';
}

/**
 * Resume guard (spec 025, R3): after an attempt with an unknown outcome the item is read again. `true`: the link is
 * there; `false`: it is not; `null`: the item could not be read, nothing is sent (a duplicate is worse).
 */
async function linkAlreadyAttached(
  ctx: StepContext,
  entityId: string,
  url: string,
): Promise<boolean | null> {
  const read = await ctx.client.getEntity(entityId);
  return read.ok ? linkPresent(read.value, url) : null;
}

/**
 * Order page link (spec 025, contracts/import-order-link.md §3): after the photo, on an existing item, only when the
 * draft asked for it. Written as attempted before the POST; never interrupts the other steps.
 */
export async function orderLinkStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
): Promise<ErrorCode | null> {
  if (p.steps.orderLink === undefined || p.steps.orderLink === 'done') return null;
  const url = orderLinkUrl(p.draft.pageUrl);
  if (!url) return settleOrderLink(ctx, p, 'ORDER_LINK_FAILED');
  if (p.orderLinkAttempted) {
    const there = await linkAlreadyAttached(ctx, entityId, url);
    if (there === null) return settleOrderLink(ctx, p, 'ORDER_LINK_FAILED');
    if (there) return settleOrderLink(ctx, p, null);
  }
  p.orderLinkAttempted = true;
  await ctx.persist(p);
  const res = await ctx.client.addExternalLink(entityId, {
    url,
    title: orderLinkTitle(p.draft, url),
  });
  return settleOrderLink(
    ctx,
    p,
    res.ok ? null : await orderLinkFailure(ctx, entityId, res.httpStatus),
  );
}
