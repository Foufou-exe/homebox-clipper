import { entityOutToUpdate } from '@/background/homebox/client';
import type { EntityOut, TagSummary } from '@/background/homebox/types';
import type { ErrorCode, Result } from '@/shared/errors';
import { findExisting, normalizeTagName, tagKey, unionIds } from '@/shared/tags';
import type { PendingImport, TagChoice } from '@/shared/types';
import type { StepContext } from './context';

/**
 * HomeBox tags read and created during a call (spec 014), shared by the products of the call like `PhotoMap`:
 * the list is read once per call (always again on a retry, invariant 4).
 */
export interface TagCache {
  list?: Result<TagSummary[]>;
  created: Map<string, Result<TagSummary>>;
}
export const newTagCache = (): TagCache => ({ created: new Map() });

/** Tags of a product resolved to HomeBox identifiers; `failed`: names that cannot be applied. */
export interface ResolvedTags {
  /** Identifier and name of each resolved choice, in the order of the draft. */
  resolved: { id: string; name: string }[];
  failed: string[];
  error: ErrorCode | null;
}

/**
 * Outcome of the tags after the PUT: `done` only if a successful PUT carried every chosen tag (invariant 7),
 * otherwise `failed` with the names not applied. Returns the error to report, if any.
 */
export function settleTags(
  p: PendingImport,
  tags: ResolvedTags,
  applied: boolean,
): ErrorCode | null {
  const failed = applied ? tags.failed : [...tags.resolved.map((r) => r.name), ...tags.failed];
  const ordered = (p.draft.tags ?? []).map((c) => c.name).filter((n) => failed.includes(n));
  if (ordered.length === 0) {
    p.steps.tags = 'done';
    delete p.failedTags;
    return null;
  }
  p.steps.tags = 'failed';
  p.failedTags = ordered;
  return tags.error ?? 'TAG_FAILED';
}

/** `tagIds` of a PUT: the current tags of the object first, never removed (FR-007, invariant 5). */
export const tagIdsFor = (current: EntityOut, tags: ResolvedTags) =>
  unionIds(
    (current.tags ?? []).map((t) => t.id),
    tags.resolved.map((r) => r.id),
  );

/**
 * The current tags of the object must be known before sending `tagIds` (which replaces them all). `null` is a Go
 * nil slice, always empty: known, no tag. An absent field (or another type) gets no `tagIds`: the chosen tags are
 * reported as failed and can be retried.
 */
export const knowsTags = (o: EntityOut) => Array.isArray(o.tags) || o.tags === null;

/**
 * HomeBox tag for one choice: the existing one (`findExisting`), otherwise created at most once per call and per
 * key (invariant 3), then added to the cached list so that the next products find it. `null`: creation failed.
 */
async function tagFor(
  ctx: StepContext,
  choice: TagChoice,
  list: TagSummary[],
  cache: TagCache,
): Promise<TagSummary | null> {
  const found = findExisting(choice, list);
  if (found) return found;
  // Spec 018 (FR-015): a default tag of a template is never created; it fails alone.
  if (choice.noCreate) return null;
  const key = tagKey(choice.name);
  let created = cache.created.get(key);
  if (!created) {
    created = await ctx.client.createTag(normalizeTagName(choice.name));
    cache.created.set(key, created);
    if (created.ok) list.push(created.value);
  }
  return created.ok ? created.value : null;
}

/**
 * Tags of the product (spec 014), only after the object exists and if some are still to apply. Each choice is
 * matched against the list read once per call; a choice without a match is created (`tagFor`). A failed creation
 * fails this tag only, never the object. Never logged.
 */
export async function resolveTags(
  ctx: StepContext,
  p: PendingImport,
  cache: TagCache,
): Promise<ResolvedTags | null> {
  const choices = p.draft.tags;
  if (!choices?.length || p.steps.tags === 'done') return null;
  cache.list ??= await ctx.client.listTags();
  const list = cache.list;
  if (!list.ok)
    return { resolved: [], failed: choices.map((c) => c.name), error: 'TAGS_UNAVAILABLE' };
  const resolved: { id: string; name: string }[] = [];
  const failed: string[] = [];
  for (const choice of choices) {
    const found = await tagFor(ctx, choice, list.value, cache); // NOSONAR: sequential on purpose (one creation per tag key, shared cache)
    if (found) resolved.push({ id: found.id, name: choice.name });
    else failed.push(choice.name);
  }
  return { resolved, failed, error: failed.length ? 'TAG_FAILED' : null };
}

/** Records the tag outcome without any PUT (nothing applied), then persists. */
async function tagsNotApplied(
  ctx: StepContext,
  p: PendingImport,
  tags: ResolvedTags,
): Promise<ErrorCode | null> {
  const tagsError = settleTags(p, tags, false);
  await ctx.persist(p);
  return tagsError;
}

/** Purchase already saved: PUT reserved to the tags, on the object read again so that nothing else is overwritten. */
export async function tagsOnlyStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  tags: ResolvedTags,
): Promise<ErrorCode | null> {
  if (tags.resolved.length === 0) return tagsNotApplied(ctx, p, tags);
  const current = await ctx.client.getEntity(entityId);
  if (current.ok && !knowsTags(current.value)) return tagsNotApplied(ctx, p, tags);
  const res = current.ok
    ? await ctx.client.updateEntity(
        entityId,
        entityOutToUpdate(current.value, { tagIds: tagIdsFor(current.value, tags) }),
      )
    : current;
  const tagsError = settleTags(p, tags, res.ok);
  await ctx.persist(p);
  return tagsError;
}
