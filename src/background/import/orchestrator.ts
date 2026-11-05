import { entityOutToUpdate, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';
import { getMessage } from '@/platform/i18n';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { findDuplicatesByName } from './duplicates';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import { flattenTree } from '@/shared/locations';
import type {
  DocumentRef,
  DraftPhoto,
  ImportDraft,
  LocationChoice,
  ManualFile,
  PendingImport,
  PhotoStep,
} from '@/shared/types';
import type { FetchedPhoto } from './photo-fetch';

export interface OrchestratorDeps {
  client: HomeBoxClient;
  store: {
    save(p: PendingImport): Promise<void>;
    get(id: string): Promise<PendingImport | null>;
    purge(p: PendingImport): Promise<void>;
  };
  /** Télécharge un document détecté via le script injecté dans l'onglet amazon.fr. */
  downloadDetected(tabId: number, url: string): Promise<Result<{ base64: string }>>;
  /** Récupère la photo sur le serveur du marchand (module séparé : il n'a jamais accès à la clé). */
  fetchPhoto(photo: DraftPhoto): Promise<Result<FetchedPhoto>>;
  /**
   * Mémorise le dernier emplacement utilisé avec cette instance (R10) : identifiant seul. Optionnel, et une
   * erreur d'écriture n'interrompt jamais l'import.
   */
  rememberLocation?(locationId: string): Promise<void>;
  notify(p: PendingImport): void;
  newId(): string;
}

type FileMap = Map<string, Result<Uint8Array>>;
/** Photos récupérées pendant un appel, par URL : une commande de plusieurs produits ne télécharge l'image qu'une fois. */
type PhotoMap = Map<string, Result<FetchedPhoto>>;

function initialPhotoStep(photo: DraftPhoto | null): PhotoStep {
  if (!photo) return 'unavailable';
  return photo.include ? 'pending' : 'not_requested';
}

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

  /** Télécharge la photo une seule fois par URL pendant un appel. */
  async function photoFor(photo: DraftPhoto, photos: PhotoMap): Promise<Result<FetchedPhoto>> {
    const cached = photos.get(photo.url);
    if (cached) return cached;
    const result = await deps.fetchPhoto(photo);
    photos.set(photo.url, result);
    return result;
  }

  /**
   * Anti-double (R8) : après une tentative d'envoi dont l'issue est inconnue, on relit l'objet. Une photo
   * déjà jointe (`type`, jamais `primary`) clôt l'étape ; une lecture impossible l'échoue sans envoyer.
   */
  async function reconcilePhoto(p: PendingImport, entityId: string): Promise<void> {
    const step = p.steps.photo;
    if (step !== 'sending' && step !== 'failed') return;
    if (!p.photoAttempted) {
      p.steps.photo = 'pending';
      return;
    }
    const current = await client.getEntity(entityId);
    if (!current.ok) {
      p.steps.photo = 'failed';
      p.photoError = 'PHOTO_UPLOAD_FAILED';
    } else if (current.value.attachments?.some((a) => a.type === 'photo')) {
      p.steps.photo = 'done';
      p.photoError = null;
    } else {
      p.steps.photo = 'pending';
    }
  }

  async function sendPhoto(p: PendingImport, entityId: string, photos: PhotoMap): Promise<void> {
    const photo = p.draft.photo;
    if (!photo) return;
    const fetched = await photoFor(photo, photos);
    if (!fetched.ok) {
      p.steps.photo = 'failed';
      p.photoError = fetched.error;
      return;
    }
    // Écriture anticipée : si le service worker s'arrête pendant le POST, la reprise relira l'objet.
    p.steps.photo = 'sending';
    p.photoAttempted = true;
    await persist(p);
    const res = await client.addAttachment(entityId, {
      bytes: fetched.value.bytes,
      filename: fetched.value.filename,
      type: 'photo',
      mimeType: fetched.value.mimeType,
      primary: true,
    });
    p.steps.photo = res.ok ? 'done' : 'failed';
    p.photoError = res.ok ? null : 'PHOTO_UPLOAD_FAILED';
  }

  /**
   * Un échec certain du POST avec emplacement choisi : HomeBox répond 404 sans rien créer si le `parentId`
   * est inconnu (V4), mais ce statut seul ne dit pas si c'est le parent qui manque. On relit l'arbre :
   * identifiant absent → `LOCATION_NOT_FOUND`, présent ou relecture impossible → `CREATE_FAILED` (R3).
   */
  async function creationFailureFor(location: LocationChoice | null | undefined): Promise<ErrorCode> {
    if (!location) return 'CREATE_FAILED';
    const tree = await client.listLocations();
    if (!tree.ok) return 'CREATE_FAILED';
    return flattenTree(tree.value).some((l) => l.id === location.id) ? 'CREATE_FAILED' : 'LOCATION_NOT_FOUND';
  }

  /** Écrit la mémoire du dernier emplacement ; ne bloque jamais l'import. */
  async function remember(locationId: string | null | undefined, results: PendingImport[]): Promise<void> {
    if (!locationId || !deps.rememberLocation || !results.some((r) => r.entityId)) return;
    try {
      await deps.rememberLocation(locationId);
    } catch {
      // mémoire non écrite : sans conséquence pour l'import
    }
  }

  /**
   * Exécute les étapes restantes d'un import. Invariant (FR-021) : une fois `entityId`
   * renseigné, l'objet n'est jamais recréé.
   */
  async function run(p: PendingImport, files: FileMap, photos: PhotoMap): Promise<PendingImport> {
    delete p.orphaned;
    p.status = 'running';
    p.error = null;
    await persist(p);

    let created: EntityOut | null = null;
    if (!p.entityId) {
      // Écriture anticipée (R8) : si le service worker s'arrête pendant le POST, l'import orphelin saura
      // que l'objet a pu être créé.
      p.createAttempted = true;
      delete p.createUncertain;
      await persist(p);
      const res = await client.createEntity({
        name: p.draft.name,
        description: p.draft.description || undefined,
        quantity: p.draft.quantity,
        // `parentId` seulement si un emplacement est choisi : sans choix, le corps reste celui de la spec 001.
        ...(p.draft.location ? { parentId: p.draft.location.id } : {}),
      });
      if (!res.ok) {
        p.steps.create = 'failed';
        p.status = 'failed';
        p.error = res.error === 'CREATE_FAILED' ? await creationFailureFor(p.draft.location) : res.error;
        // Réponse perdue (réseau, délai) : le POST a pu aboutir. Une erreur HTTP explicite est un échec certain.
        // Réponse 2xx illisible ou sans `id` : l'objet existe peut-être aussi, même traitement.
        const acceptedButUnreadable = res.httpStatus !== undefined && res.httpStatus >= 200 && res.httpStatus < 300;
        if (res.error === 'HOMEBOX_UNREACHABLE' || acceptedButUnreadable) p.createUncertain = true;
        else p.createAttempted = false;
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
              // Un PUT sans `parentId` ferait perdre l'emplacement (V3) : on le renvoie toujours.
              parentId: current.value.parent?.id ?? p.draft.location?.id,
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
            mimeType: 'application/pdf',
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

    p.steps.photo ??= 'not_requested';
    p.photoError ??= null;
    await reconcilePhoto(p, entityId);
    if (p.steps.photo === 'pending') {
      await sendPhoto(p, entityId, photos);
      await persist(p);
    }
    // Tant que la photo n'est pas en échec, aucune erreur de photo n'est conservée.
    if (p.steps.photo !== 'failed') p.photoError = null;
    else partialError ??= p.photoError;

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
    async startImport(
      tabId: number,
      drafts: ImportDraft[],
      manualFiles: ManualFile[],
      /** Choix au niveau de la commande, pour la mémoire du dernier emplacement (R10). */
      orderLocationId: string | null = null,
    ): Promise<Result<PendingImport[]>> {
      if (drafts.some((d) => d.name.trim() === '')) return fail('PRODUCT_NOT_FOUND');
      const files = filesFrom(manualFiles);
      const photos: PhotoMap = new Map();
      // Rejet des fichiers manuels invalides avant tout appel HomeBox.
      for (const result of files.values()) if (!result.ok) return result;

      // Tous les imports du lot sont persistés avant le premier POST : si le service worker s'arrête pendant
      // le premier, les suivants restent visibles et réessayables.
      const pendings: PendingImport[] = drafts.map((draft) => ({
        id: deps.newId(),
        tabId,
        pageUrl: draft.pageUrl,
        draft,
        entityId: null,
        steps: {
          create: 'pending',
          update: 'pending',
          attachments: Object.fromEntries(draft.documents.map((d) => [d.id, 'pending'])),
          photo: initialPhotoStep(draft.photo),
        },
        status: 'running',
        error: null,
        photoError: null,
        photoAttempted: false,
      }));
      for (const pending of pendings) await store.save(pending);

      const results: PendingImport[] = [];
      for (const pending of pendings) results.push(await run(pending, files, photos));
      await remember(orderLocationId, results);
      return ok(results);
    },

    async retryImport(
      pendingId: string,
      manualFiles: ManualFile[] = [],
      /** Absent : choix inchangé ; `null` : sans emplacement ; sinon nouveau choix (FR-018). */
      location?: LocationChoice | null,
    ): Promise<Result<PendingImport>> {
      const pending = await store.get(pendingId);
      if (!pending) return fail('BAD_MESSAGE');
      // Invariant 3 : l'objet existe déjà, son emplacement ne se change plus ici. Refus avant toute requête.
      if (location !== undefined && pending.entityId) return fail('BAD_MESSAGE');
      if (location !== undefined) pending.draft = { ...pending.draft, location };
      const files = filesFrom(manualFiles);
      for (const result of files.values()) if (!result.ok) return result;
      // Création incertaine (réponse perdue, ou arrêt du service worker pendant le POST) : l'objet a pu être
      // créé sans que son identifiant soit enregistré. On cherche son nom exact avant de renvoyer un POST ;
      // le risque de doublon n'est réduit que, pas supprimé (objet renommé, index de recherche en retard).
      const uncertain = pending.createUncertain || (pending.orphaned && pending.createAttempted);
      if (!pending.entityId && uncertain) {
        const dup = await findDuplicatesByName(client, pending.draft.name);
        if (!dup.ok) return fail('DUPLICATE_CHECK_FAILED');
        if (dup.value.length > 0) return fail('DUPLICATE_SUSPECTED');
      }
      const needsManual = pending.draft.documents.some(
        (d) => d.origin === 'manual' && pending.steps.attachments[d.id] !== 'done' && !files.has(d.id),
      );
      if (needsManual) return fail('MANUAL_FILE_REQUIRED');
      return ok(await run(pending, files, new Map()));
    },

    async abandonImport(pendingId: string): Promise<Result<void>> {
      const pending = await store.get(pendingId);
      if (pending) await store.purge(pending);
      return ok(undefined);
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
