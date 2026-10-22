/**
 * SEUL fichier contenant des sélecteurs Amazon.fr (constitution, principe III).
 * Pour chaque champ : liste ordonnée par priorité ; le premier sélecteur donnant une valeur
 * exploitable l'emporte. En cas de changement de mise en page Amazon, corriger ici et ajouter
 * une fixture reproduisant la nouvelle structure (principe VII).
 */
export const SELECTORS = {
  /** Présence = page de détail de commande. */
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
  /** Mention « Vendu par : … » (lue dans la première ligne de produit qui la contient). */
  seller: ['[data-component="orderedMerchant"]', '.a-color-secondary', '.a-size-small'],
  /** Une ligne par produit commandé. */
  productRow: [
    '[data-component="purchasedItemsRightGrid"]',
    '.yohtmlc-item',
    '[data-component="purchasedItems"] .a-fixed-left-grid',
  ],
  /** Sélecteurs relatifs à une ligne de produit. */
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
  /** Lien contenant l'ASIN dans son href. */
  productAsin: ['a[href*="/dp/"]', 'a[href*="/gp/product/"]'],
  /** Liens directs vers une facture PDF. */
  invoiceLink: [
    '[data-component="orderDetailsInvoice"] a[href*="/documents/download/"]',
    'a[href*="/documents/download/"][href*="invoice"]',
    'a[href*="/documents/download/"]',
  ],
  /** Lien ou déclencheur du menu « Facture » chargé à la demande. */
  invoicePopoverTrigger: ['a[href*="/invoice/invoice.html"]', '[data-a-popover*="invoice.html"]'],
  /** Liens PDF dans le contenu du menu « Facture ». */
  invoicePopoverPdfLink: ['a[href*="/documents/download/"]', 'a[href$=".pdf"]'],
} as const satisfies Record<string, readonly string[]>;

export type SelectorField = keyof typeof SELECTORS;
