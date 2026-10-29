import { entityOutToUpdate, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';
import { getMessage } from '@/platform/i18n';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import type { DocumentRef, ImportDraft, ManualFile, PendingImport } from '@/shared/types';

export interface OrchestratorDeps {
  client: HomeBoxClient;
  store: {
    save(p: PendingImport): Promise<void>;
    get(id: string): Promise<PendingImport | null>;
    purge(p: PendingImport): Promise<void>;
  };
  /** Télécharge un document détecté via le script injecté dans l'onglet amazon.fr. */
  downloadDetected(tabId: number, url: string): Promise<Result<{ base64: string }>>;
  notify(p: PendingImport): void;
  newId(): string;
}

type FileMap = Map<string, Result<Uint8Array>>;

export function buildNotes(draft: ImportDraft): string | undefined {
  if (!draft.orderNumber) return undefined;
  return [getMessage('summary.orderNote', [draft.orderNumber]), draft.pageUrl].filter(Boolean).join('\n');
}

function manualBytes(file: ManualFile): Result<Uint8Array> {
  if (base64Size(file.base64) > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');
  const bytes = base64ToBytes(file.base64);
  // Revérification côté service worker, même si l'UI a déjà contrôlé le fichier (R10).
  return isPdf(bytes) ? ok(bytes) : fail('NOT_A_PDF');
}

const attachmentName = (doc: DocumentRef) => (/\.pdf$/i.test(doc.label) ? doc.label : `${doc.label}.pdf`);

export function createOrchestrator(deps: OrchestratorDeps) {
  const { client, store, notify } = deps;

  async function persist(p: PendingImport): Promise<void> {
    await store.save(p);
    notify(p);
  }

  async function bytesFor(p: PendingImport, doc: DocumentRef, files: FileMap): Promise<Result<Uint8Array>> {
    const cached = files.get(doc.id);
    if (cached) return cached;
    let result: Result<Uint8Array>;
    if (doc.origin === 'manual') {
      result = fail('MANUAL_FILE_REQUIRED');
    } else if (!doc.url) {
      result = fail('INVOICE_UNAVAILABLE');
    } else {
      const res = await deps.downloadDetected(p.tabId, doc.url);
      result = res.ok ? ok(base64ToBytes(res.value.base64)) : res;
    }
    // Un même document peut être joint à plusieurs objets : un seul téléchargement.
    files.set(doc.id, result);
    return result;
  }

  /**
   * Exécute les étapes restantes d'un import. Invariant (FR-021) : une fois `entityId`
   * renseigné, l'objet n'est jamais recréé.
   */
  async function run(p: PendingImport, files: FileMap): Promise<PendingImport> {
    p.status = 'running';
    p.error = null;
    await persist(p);

    let created: EntityOut | null = null;
    if (!p.entityId) {
      const res = await client.createEntity({
        name: p.draft.name,
        description: p.draft.description || undefined,
        quantity: p.draft.quantity,
      });
      if (!res.ok) {
        p.steps.create = 'failed';
        p.status = 'failed';
        p.error = res.error;
        await persist(p);
        return p;
      }
      created = res.value;
      p.entityId = res.value.id;
      p.steps.create = 'done';
      await persist(p);
    }
    const entityId = p.entityId;

    let partialError: ErrorCode | null = null;

    if (p.steps.update !== 'done') {
      const current = created ? ok(created) : await client.getEntity(entityId);
      const res = current.ok
        ? await client.updateEntity(
            entityId,
            entityOutToUpdate(current.value, {
              purchasePrice: p.draft.purchasePrice ?? undefined,
              purchaseDate: p.draft.purchaseDate ?? undefined,
              purchaseFrom: p.draft.purchaseFrom || undefined,
              notes: buildNotes(p.draft),
            }),
          )
        : current;
      p.steps.update = res.ok ? 'done' : 'failed';
      if (!res.ok) partialError = res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED';
      await persist(p);
    }

    for (const doc of p.draft.documents) {
      if (p.steps.attachments[doc.id] === 'done') continue;
      const bytes = await bytesFor(p, doc, files);
      const res = bytes.ok
        ? await client.addAttachment(entityId, {
            bytes: bytes.value,
            filename: attachmentName(doc),
            type: doc.kind === 'invoice' ? 'receipt' : 'attachment',
          })
        : bytes;
      p.steps.attachments[doc.id] = res.ok ? 'done' : 'failed';
      if (!res.ok) {
        partialError ??=
          res.error === 'UNAUTHORIZED' || res.error === 'HOMEBOX_UNREACHABLE' || res.error === 'ATTACHMENT_FAILED'
            ? 'ATTACHMENT_FAILED'
            : res.error;
      }
      await persist(p);
    }

    if (partialError) {
      p.status = 'partial';
      p.error = partialError;
      await persist(p);
      return p;
    }
    p.status = 'success';
    notify(p);
    // FR-025 : les données d'achat sont effacées dès que l'import a réussi.
    await store.purge(p);
    return p;
  }

  function filesFrom(manualFiles: ManualFile[]): FileMap {
    return new Map(manualFiles.map((f) => [f.docId, manualBytes(f)]));
  }

  return {
    async startImport(tabId: number, drafts: ImportDraft[], manualFiles: ManualFile[]): Promise<Result<PendingImport[]>> {
      if (drafts.some((d) => d.name.trim() === '')) return fail('PRODUCT_NOT_FOUND');
      const files = filesFrom(manualFiles);
      // Rejet des fichiers manuels invalides avant tout appel HomeBox.
      for (const result of files.values()) if (!result.ok) return result;

      const results: PendingImport[] = [];
      for (const draft of drafts) {
        const pending: PendingImport = {
          id: deps.newId(),
          tabId,
          pageUrl: draft.pageUrl,
          draft,
          entityId: null,
          steps: {
            create: 'pending',
            update: 'pending',
            attachments: Object.fromEntries(draft.documents.map((d) => [d.id, 'pending'])),
          },
          status: 'running',
          error: null,
        };
        results.push(await run(pending, files));
      }
      return ok(results);
    },

    async retryImport(pendingId: string, manualFiles: ManualFile[] = []): Promise<Result<PendingImport>> {
      const pending = await store.get(pendingId);
      if (!pending) return fail('BAD_MESSAGE');
      const files = filesFrom(manualFiles);
      for (const result of files.values()) if (!result.ok) return result;
      const needsManual = pending.draft.documents.some(
        (d) => d.origin === 'manual' && pending.steps.attachments[d.id] !== 'done' && !files.has(d.id),
      );
      if (needsManual) return fail('MANUAL_FILE_REQUIRED');
      return ok(await run(pending, files));
    },

    async abandonImport(pendingId: string): Promise<Result<void>> {
      const pending = await store.get(pendingId);
      if (pending) await store.purge(pending);
      return ok(undefined);
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
