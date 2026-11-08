/**
 * ONLY file containing Amazon.fr selectors (constitution, principle III).
 * For each field: a list ordered by priority; the first selector that yields a value
 * usable wins. If Amazon changes its page layout, fix it here and add
 * a fixture reproducing the new structure (principle VII).
 */
export const SELECTORS = {
  /** Presence = order detail page. */
  orderPageMarker: [
    '[data-component="orderDetails"]',
    '#orderDetails',
    '#orderDetailsContainer',
    '.order-details',
  ],
  orderNumber: [
    '[data-component="orderId"]',
    '[data-test-id="order-id"]',
    '.order-date-invoice-item',
    '#orderDetails',
  ],
  orderDate: [
    '[data-component="orderDate"]',
    '[data-test-id="order-date"]',
    '.order-date-invoice-item',
    '#orderDetails',
  ],
  /** "Vendu par: …" ("Sold by") mention (read from the first product row that contains it). */
  seller: ['[data-component="orderedMerchant"]', '.a-color-secondary', '.a-size-small'],
  /** One row per ordered product. */
  productRow: [
    '[data-component="purchasedItemsRightGrid"]',
    '.yohtmlc-item',
    '[data-component="purchasedItems"] .a-fixed-left-grid',
  ],
  /** Container of the full row: the image is in the left column, outside `productRow`. */
  productRowContainer: ['.a-fixed-left-grid'],
  /** Selectors relative to a product row. */
  productName: [
    '[data-component="itemTitle"] a',
    '[data-component="itemTitle"]',
    '.yohtmlc-product-title',
    'a.a-link-normal[href*="/dp/"]',
    'a.a-link-normal[href*="/gp/product/"]',
  ],
  productPrice: [
    '[data-component="unitPrice"] .a-offscreen',
    '[data-component="unitPrice"]',
    '.a-price .a-offscreen',
    '.a-color-price',
  ],
  productQuantity: [
    '.od-item-view-qty span',
    '.od-item-view-qty',
    '.item-view-qty',
    '[data-component="quantity"]',
  ],
  productImage: ['[data-component="itemImage"] img', '.item-view-left-col-inner img', 'img'],
  /** Link containing the ASIN in its href. */
  productAsin: ['a[href*="/dp/"]', 'a[href*="/gp/product/"]'],
  /** Direct links to a PDF invoice. */
  invoiceLink: [
    '[data-component="orderDetailsInvoice"] a[href*="/documents/download/"]',
    'a[href*="/documents/download/"][href*="invoice"]',
    'a[href*="/documents/download/"]',
  ],
  /** Link or trigger of the "Facture" (invoice) menu, loaded on demand. */
  invoicePopoverTrigger: [
    '[data-component="orderInvoice"] [data-a-popover]',
    '[data-a-popover*="invoice/popover"]',
    'a[href*="/invoice/invoice.html"]',
    '[data-a-popover*="invoice.html"]',
  ],
  /** PDF links in the content of the "Facture" menu. */
  invoicePopoverPdfLink: ['a[href*="/documents/download/"]', 'a[href$=".pdf"]'],
} as const satisfies Record<string, readonly string[]>;

export type SelectorField = keyof typeof SELECTORS;
