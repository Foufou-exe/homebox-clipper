/**
 * Document kinds a user can attach (spec 007). Single source of truth: the interface kind and the
 * HomeBox attachment type are linked here and nowhere else (V4).
 */
export const DOCUMENT_KINDS = ['invoice', 'manual', 'warranty', 'delivery_note', 'order_document'] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Values of the HomeBox `attachment.Type` enumeration used by the extension. */
export type AttachmentType = 'receipt' | 'attachment' | 'photo' | 'manual' | 'warranty';

export const isDocumentKind = (x: unknown): x is DocumentKind =>
  typeof x === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(x);

/** Types a HomeBox instance may refuse (HTTP 422): the document is then resent once as a plain attachment. */
export const isOptionalHomeboxType = (t: AttachmentType): boolean => t === 'manual' || t === 'warranty';

/** Interface kind → HomeBox type (research.md R1). Total: an unknown value → 'attachment'. */
export function homeboxTypeOf(kind: DocumentKind): Exclude<AttachmentType, 'photo'> {
  switch (kind) {
    case 'invoice':
      return 'receipt';
    case 'manual':
      return 'manual';
    case 'warranty':
      return 'warranty';
    case 'delivery_note':
    case 'order_document':
      return 'attachment';
    default:
      return 'attachment';
  }
}
