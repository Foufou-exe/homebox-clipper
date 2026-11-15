/**
 * Names and identifiers of the documents a merchant module detects (spec 007, contracts/extraction-documents.md).
 * Pure: no DOM, no browser API, no network.
 */

/** Invoices keep their historical names byte for byte; delivery notes get their own prefix and identifier. */
const LABEL_PREFIX = { invoice: 'facture', delivery_note: 'bon-de-livraison' } as const;

/** `index` 0 has no suffix; index `i` gets `-<i+1>`. */
export function documentLabel(
  kind: 'invoice' | 'delivery_note',
  merchantSlug: string,
  orderNumber: string | null,
  index: number,
): string {
  const orderSuffix = orderNumber ? `-${orderNumber}` : '';
  const indexSuffix = index === 0 ? '' : `-${index + 1}`;
  return `${LABEL_PREFIX[kind]}-${merchantSlug}${orderSuffix}${indexSuffix}.pdf`;
}

export function documentId(kind: 'invoice' | 'delivery_note', index: number): string {
  return kind === 'invoice' ? `detected-${index}` : `detected-delivery-${index}`;
}

const DELIVERY_NOTE_TERMS =
  /bon de livraison|bordereau de livraison|delivery note|packing slip|dispatch note|lieferschein|albar[aá]n|documento di trasporto|pakbon/i;
/** A link containing one of these is not a delivery note: return label, invoice, credit note, printable summary (FR-006). */
const NOT_A_DELIVERY_NOTE =
  /retour|return|\brma\b|[ée]tiquette|label|facture|invoice|rechnung|avoir|credit|gutschrift|r[ée]capitulatif|summary|imprimable|printable/i;

/**
 * Fallback recognition by label (the structural marker of the merchant comes first). Shared so that a merchant
 * module does not copy the lists of terms and exclusions. Amazon does not call it: it has no delivery-note selector.
 */
export function isDeliveryNoteText(text: string): boolean {
  return DELIVERY_NOTE_TERMS.test(text) && !NOT_A_DELIVERY_NOTE.test(text);
}
