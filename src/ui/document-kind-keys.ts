import type { DocumentKind } from '@/shared/document-kinds';
import type { MessageKey } from '@/ui/i18n';

/** Catalog keys of each document kind (contracts/ui.md). The compiler requires all five entries. */
export const DOCUMENT_KIND_KEYS: Record<
  DocumentKind,
  { label: MessageKey; sendFailed: MessageKey; withDocument: MessageKey }
> = {
  invoice: { label: 'documents.invoice', sendFailed: 'documents.sendFailed.invoice', withDocument: 'result.withDocument.invoice' },
  manual: { label: 'documents.manual', sendFailed: 'documents.sendFailed.manual', withDocument: 'result.withDocument.manual' },
  warranty: { label: 'documents.warranty', sendFailed: 'documents.sendFailed.warranty', withDocument: 'result.withDocument.warranty' },
  delivery_note: {
    label: 'documents.deliveryNote',
    sendFailed: 'documents.sendFailed.deliveryNote',
    withDocument: 'result.withDocument.deliveryNote',
  },
  order_document: {
    label: 'documents.orderDocument',
    sendFailed: 'documents.sendFailed.orderDocument',
    withDocument: 'result.withDocument.orderDocument',
  },
};

/** Kinds in the order offered to the user. */
export const DOCUMENT_KIND_OPTIONS: readonly DocumentKind[] = [
  'invoice',
  'manual',
  'warranty',
  'delivery_note',
  'order_document',
];

/** "Replace the detected invoice" only makes sense for an invoice or an order document. */
export const canReplaceDetected = (kind: DocumentKind): boolean => kind === 'invoice' || kind === 'order_document';
