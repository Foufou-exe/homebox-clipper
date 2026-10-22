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
  /** Affichage uniquement, jamais envoyé à HomeBox. */
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
}

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
  };
  status: 'running' | 'success' | 'partial' | 'failed';
  error: ErrorCode | null;
}

export interface LastCheck {
  status: 'ok' | 'error';
  code?: ErrorCode;
  version?: string;
  /** ISO 8601 */
  at: string;
}

export interface HomeBoxConfig {
  baseUrl: string;
  apiKey: string;
  lastCheck: LastCheck | null;
}

/** Vue de la configuration exposée à l'UI : ne contient jamais la clé (principe I). */
export interface ConfigView {
  configured: boolean;
  baseUrl?: string;
  maskedKey?: string;
  lastCheck?: LastCheck | null;
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
