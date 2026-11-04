import type { DetectedPurchase, DocumentRef } from '@/shared/types';

/** Contrat d'un extracteur marchand (contracts/merchant-extractor.md). */
export interface MerchantExtractor {
  id: DetectedPurchase['source'];
  /** Noms d'hôte pris en charge (utilisés pour garder MERCHANTS.md cohérent avec le code). */
  domains: readonly string[];
  /**
   * Hôtes exacts autorisés pour la photo du produit. Obligatoire : chaque marchand doit se prononcer.
   * Une liste vide signifie « ce marchand ne fournit pas de photo ».
   */
  imageHosts: readonly string[];
  /** Vrai si l'URL relève de ce marchand (testé avant toute injection). */
  matchesUrl(url: URL): boolean;
  /** Vrai si le document est une page de détail de commande. */
  isOrderPage(doc: Document): boolean;
  /** Extraction pure, sans réseau ni effet de bord. Ne lève jamais d'exception. */
  extract(doc: Document, pageUrl: URL): DetectedPurchase;
  /** Résout les URL réelles de PDF (ex. menu « Facture »). Même origine uniquement. */
  resolveDocuments(doc: Document, pageUrl: URL, fetchSameOrigin: typeof fetch): Promise<DocumentRef[]>;
}
