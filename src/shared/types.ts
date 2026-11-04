import type { ErrorCode } from './errors';

/** Valeur extraite d'une page, ou absence explicite (principe III). */
export type Field<T> =
  | { value: T; selector: string }
  | { value: null; reason: 'not_found' | 'unparsable' };

export interface DetectedProduct {
  /** ASIN si présent, sinon index dans la page. */
  key: string;
  name: Field<string>;
  unitPrice: Field<number>;
  /** Code ISO 4217. */
  currency: Field<string>;
  quantity: Field<number>;
  /**
   * URL de la photo proposée à l'envoi vers HomeBox : déjà filtrée par `imageHosts` du marchand et
   * réécrite à la résolution voulue.
   */
  imageUrl: Field<string>;
}

export interface DocumentRef {
  id: string;
  origin: 'detected' | 'manual';
  kind: 'invoice' | 'order_document';
  label: string;
  /** Pour `detected` : URL même origine amazon.fr. */
  url?: string;
  size?: number;
  pdfValid?: boolean;
}

export interface DetectedPurchase {
  source: 'amazon.fr';
  /** URL de la page de commande, sans paramètres de requête. */
  pageUrl: string;
  orderNumber: Field<string>;
  /** YYYY-MM-DD */
  orderDate: Field<string>;
  seller: Field<string>;
  products: DetectedProduct[];
  documents: DocumentRef[];
}

/** Photo proposée avec l'objet. Les octets ne sont jamais conservés : seule l'URL l'est, jusqu'à la purge. */
export interface DraftPhoto {
  url: string;
  /** Donne la liste `imageHosts` qui sert à recontrôler l'URL dans le service worker. */
  merchantId: DetectedPurchase['source'];
  /** Vrai par défaut (FR-002) ; décochée, la photo n'est pas récupérée. */
  include: boolean;
}

export interface ImportDraft {
  name: string;
  description: string;
  purchasePrice: number | null;
  currency: string;
  /** YYYY-MM-DD */
  purchaseDate: string | null;
  purchaseFrom: string;
  orderNumber: string | null;
  quantity: number;
  pageUrl: string | null;
  documents: DocumentRef[];
  /** `null` : aucune photo détectée (ou saisie manuelle). */
  photo: DraftPhoto | null;
}

export type PhotoStep = 'not_requested' | 'unavailable' | 'pending' | 'sending' | 'done' | 'failed';

export type StepState = 'pending' | 'done' | 'failed';

export interface PendingImport {
  id: string;
  tabId: number;
  pageUrl: string | null;
  draft: ImportDraft;
  entityId: string | null;
  steps: {
    create: StepState;
    update: StepState;
    attachments: Record<string, StepState>;
    /** Lu avec `?? 'not_requested'` par prudence (état persisté par une version précédente). */
    photo: PhotoStep;
  };
  status: 'running' | 'success' | 'partial' | 'failed';
  error: ErrorCode | null;
  /** Erreur propre à la photo, affichée à part de `error`. */
  photoError: ErrorCode | null;
  /** Vrai dès qu'un POST de photo a pu partir : déclenche la relecture anti-double à la reprise (R8). */
  photoAttempted: boolean;
  /** Vrai dès que le POST de création a pu partir (écrit avant l'envoi) ; remis à faux après un échec certain (R8). */
  createAttempted?: boolean;
  /**
   * Création d'issue inconnue : la réponse du POST s'est perdue (réseau, délai) ou le service worker s'est
   * arrêté pendant le POST. L'objet a pu être créé sans `entityId` : la reprise cherche d'abord son nom (R8).
   */
  createUncertain?: boolean;
  /** Posé quand un import `running` est récupéré après l'arrêt du service worker (R8) ; retiré à la reprise. */
  orphaned?: boolean;
}

export interface LastCheck {
  status: 'ok' | 'error';
  code?: ErrorCode;
  version?: string;
  /** ISO 8601 */
  at: string;
}

/** Vue de la configuration exposée à l'UI : ne contient jamais la clé (principe I). */
export interface ConfigView {
  configured: boolean;
  baseUrl?: string;
  maskedKey?: string;
  lastCheck?: LastCheck | null;
  /** Clé chiffrée présente mais pas encore déverrouillée pour cette session. */
  locked?: boolean;
  /** Clé migrée de l'ancien format en clair : une phrase de passe doit être définie. */
  needsPassphrase?: boolean;
}

/** Fichier choisi par l'utilisateur, transmis au service worker. */
export interface ManualFile {
  docId: string;
  filename: string;
  base64: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  url: string;
}
