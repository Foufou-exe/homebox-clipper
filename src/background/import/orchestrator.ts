import type { EntityOut } from '@/background/homebox/types';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type {
  CompletionChoice,
  ImportDraft,
  LocationChoice,
  ManualFile,
  PendingImport,
} from '@/shared/types';
import {
  attachmentsStep,
  filesFrom,
  firstFileFailure,
  needsManualFile,
  photoStep,
  type FileMap,
  type PhotoMap,
} from './steps/attachments';
import { completionPending, completionSteps } from './steps/completion-run';
import { createStepContext, type OrchestratorDeps } from './steps/context';
import {
  creationPending,
  ensureEntity,
  locationChangeRefused,
  rememberType,
  uncertainDuplicate,
} from './steps/create';
import { hasOrderFields, orderFieldsUpdateStep } from './steps/order-fields';
import { orderLinkStep } from './steps/order-link';
import { newTagCache, resolveTags, type ResolvedTags, type TagCache } from './steps/tags';
import { hasTemplate, templateGate, templateUpdateStep, verifyTemplates } from './steps/templates';
import { keepAccessError, updateStep, type UpdateErrors } from './steps/update';

export type { OrchestratorDeps } from './steps/context';
export { buildNotes } from './steps/update';
/** Name of the attachment of a document: moved to the pure completion module (spec 021), unchanged. */
export { attachmentName } from './completion';

/**
 * Sequencing of the imports. Each step lives in `steps/` and receives the explicit `StepContext` (HomeBox client,
 * dependencies, state writes); this function only chains them.
 */
export function createOrchestrator(deps: OrchestratorDeps) {
  const { client, store, notify } = deps;
  const ctx = createStepContext(deps);
  const { persist, record } = ctx;

  /** Writes the last-location memory; never blocks the import. */
  async function remember(
    locationId: string | null | undefined,
    results: PendingImport[],
  ): Promise<void> {
    // Spec 021: only a product CREATED with this location counts; a completed item keeps its own location.
    if (
      !locationId ||
      !deps.rememberLocation ||
      !results.some((r) => r.entityId && !r.draft.complete)
    )
      return;
    try {
      await deps.rememberLocation(locationId);
    } catch {
      // memory not written: no consequence for the import
    }
  }

  /** Start of a run: the import becomes `running` again and is no longer orphaned. */
  async function begin(p: PendingImport): Promise<void> {
    delete p.orphaned;
    p.status = 'running';
    p.error = null;
    await persist(p);
  }

  /** Final status: `partial` keeps the state for a retry; `success` purges it (FR-025). */
  async function finish(p: PendingImport, partialError: ErrorCode | null): Promise<PendingImport> {
    if (partialError) {
      p.status = 'partial';
      p.error = partialError;
      await persist(p);
      return p;
    }
    p.status = 'success';
    notify(p);
    // The history entry becomes `complete` before the purge: the state of `p` is lost afterwards.
    await record('update', p);
    // FR-025: purchase data is erased as soon as the import has succeeded.
    await store.purge(p);
    return p;
  }

  /** PUT step of a product: the order-fields path only when the draft carries some (invariant 1). */
  async function updateSteps(
    p: PendingImport,
    entity: { entityId: string; created: EntityOut | null },
    tags: ResolvedTags | null,
  ): Promise<UpdateErrors> {
    const draft = p.draft;
    if (hasOrderFields(draft))
      return orderFieldsUpdateStep(ctx, p, draft, entity.entityId, entity.created, tags);
    if (hasTemplate(draft))
      return {
        ...(await templateUpdateStep(ctx, p, draft, entity.entityId, entity.created, tags)),
        orderFieldsError: null,
      };
    return {
      ...(await updateStep(ctx, p, entity.entityId, entity.created, tags)),
      templateFieldsError: null,
      orderFieldsError: null,
    };
  }

  /** The item could not be read again: deleted (404) → `ITEM_NOT_FOUND`, nothing written; otherwise retryable. */
  async function completionReadFailed(
    p: PendingImport,
    read: { error: ErrorCode; httpStatus?: number },
  ): Promise<PendingImport> {
    if (p.steps.update !== 'done') p.steps.update = 'failed';
    if (read.httpStatus !== 404) return finish(p, keepAccessError(read.error));
    p.status = 'failed';
    p.error = 'ITEM_NOT_FOUND';
    await persist(p);
    return p;
  }

  /**
   * Spec 021: runs the steps of a product completed instead of created. The item is read again at every run (first
   * one and resumes): every write is computed on that read, and each step is idempotent (FR-021).
   */
  async function runCompletion(
    p: PendingImport,
    choice: CompletionChoice,
    files: FileMap,
    photos: PhotoMap,
    tagCache: TagCache,
  ): Promise<PendingImport> {
    await begin(p);
    const read = await client.getEntity(choice.entityId);
    if (!read.ok) return completionReadFailed(p, read);
    return finish(
      p,
      await completionSteps(ctx, p, choice, read.value, { files, photos, tagCache }),
    );
  }

  /**
   * Runs the remaining steps of an import. Invariant (FR-021): once `entityId`
   * is set, the object is never created again.
   */
  async function run(
    p: PendingImport,
    files: FileMap,
    photos: PhotoMap,
    tagCache: TagCache,
  ): Promise<PendingImport> {
    // Spec 021: a product completed instead of created has its own steps; the creation path below is unchanged.
    if (p.draft.complete) return runCompletion(p, p.draft.complete, files, photos, tagCache);
    await begin(p);
    const entity = await ensureEntity(ctx, p);
    if (!entity) return p;
    // Tags (spec 014): only once the object exists; `null` without tags to apply (nothing else runs).
    const tags = await resolveTags(ctx, p, tagCache);
    // Each step runs even if a previous one failed; the first error is the one reported.
    const { updateError, tagsError, templateFieldsError, orderFieldsError } = await updateSteps(
      p,
      entity,
      tags,
    );
    const attachmentsError = await attachmentsStep(ctx, p, entity.entityId, files);
    const photoError = await photoStep(ctx, p, entity.entityId, photos);
    const orderLinkError = await orderLinkStep(ctx, p, entity.entityId);
    return finish(
      p,
      updateError ??
        templateFieldsError ??
        orderFieldsError ??
        attachmentsError ??
        photoError ??
        orderLinkError ??
        tagsError,
    );
  }

  return {
    async startImport(
      tabId: number,
      drafts: ImportDraft[],
      manualFiles: ManualFile[],
      /** Order-level choice, for the last-location memory (R10). */
      orderLocationId: string | null = null,
      /** Spec 023: the type list was read at opening (otherwise the remembered type is never erased). */
      entityTypesRead = false,
    ): Promise<Result<PendingImport[]>> {
      if (drafts.some((d) => d.name.trim() === '')) return fail('PRODUCT_NOT_FOUND');
      // Spec 021 (defense, C4): a completed item never gets a template nor a location; refused before any request.
      // Spec 027: nor identifiers (the completion path is not extended).
      if (drafts.some((d) => d.complete && (d.template || d.location || d.entityTypeId || d.identifiers)))
        return fail('BAD_MESSAGE');
      const files = filesFrom(manualFiles);
      const photos: PhotoMap = new Map();
      // Invalid manual files are rejected before any HomeBox call.
      const fileFailure = firstFileFailure(files);
      if (fileFailure) return fileFailure;
      // Spec 018: a template requires a location (defense), then every template of the batch is checked again
      // before anything is persisted or created (FR-020). A batch without template makes no extra call.
      if (drafts.some((d) => d.template && !d.location)) return fail('BAD_MESSAGE');
      if (drafts.some((d) => d.template)) {
        const verified = await verifyTemplates(ctx, drafts);
        if (!verified.ok) return verified;
      }

      // All imports of the batch are persisted before the first POST: if the service worker stops during
      // the first one, the following ones remain visible and retryable.
      // Spec 021: a product completed instead of created gets its own initial state (`completionPending`).
      const pendings: PendingImport[] = drafts.map((draft) =>
        draft.complete
          ? completionPending(deps.newId(), tabId, draft, draft.complete)
          : creationPending(deps.newId(), tabId, draft),
      );
      for (const pending of pendings) await store.save(pending); // NOSONAR: sequential on purpose (batch saved in order before the first POST)
      for (const pending of pendings) await record('start', pending); // NOSONAR: sequential on purpose (history entries in batch order)

      const tagCache = newTagCache();
      const results: PendingImport[] = [];
      for (const pending of pendings) results.push(await run(pending, files, photos, tagCache)); // NOSONAR: sequential on purpose (imports share the photo and tag caches)
      await remember(orderLocationId, results);
      await rememberType(ctx, results, entityTypesRead);
      return ok(results);
    },

    async retryImport(
      pendingId: string,
      manualFiles: ManualFile[] = [],
      /** Absent: choice unchanged; `null`: no location; otherwise a new choice (FR-018). */
      location?: LocationChoice | null,
    ): Promise<Result<PendingImport>> {
      const pending = await store.get(pendingId);
      if (!pending) return fail('BAD_MESSAGE');
      // Refused before any request (invariant 3; spec 018 FR-005).
      if (locationChangeRefused(pending, location)) return fail('BAD_MESSAGE');
      if (location !== undefined) pending.draft = { ...pending.draft, location };
      const files = filesFrom(manualFiles);
      const fileFailure = firstFileFailure(files);
      if (fileFailure) return fileFailure;
      // Uncertain creation (lost response, or service worker stopped during the POST): the object may have been
      // created without its identifier being saved. Its exact name is searched for before sending another POST;
      // the duplicate risk is only reduced, not eliminated (renamed object, lagging search index).
      const duplicate = await uncertainDuplicate(ctx, pending);
      if (duplicate) return duplicate;
      if (needsManualFile(pending, files)) return fail('MANUAL_FILE_REQUIRED');
      const refused = await templateGate(ctx, pending);
      if (refused) return refused;
      // A new cache: the retry always reads the tag list again before any creation (invariant 4).
      return ok(await run(pending, files, new Map(), newTagCache()));
    },

    async abandonImport(pendingId: string): Promise<Result<void>> {
      const pending = await store.get(pendingId);
      if (pending) await store.purge(pending);
      return ok(undefined);
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
