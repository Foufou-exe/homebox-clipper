export type ErrorCode =
  | 'INVALID_URL'
  | 'INSECURE_URL'
  | 'HOMEBOX_UNREACHABLE'
  | 'UNAUTHORIZED'
  | 'PERMISSION_DENIED'
  | 'NOT_AN_ORDER_PAGE'
  | 'PRODUCT_NOT_FOUND'
  | 'INVOICE_MISSING'
  | 'INVOICE_UNAVAILABLE'
  | 'DOWNLOAD_REFUSED'
  | 'NOT_A_PDF'
  | 'FILE_TOO_LARGE'
  | 'DUPLICATE_SUSPECTED'
  | 'DUPLICATE_CHECK_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'ATTACHMENT_FAILED'
  | 'MANUAL_FILE_REQUIRED'
  | 'NOT_CONFIGURED'
  | 'BAD_MESSAGE';

export const ERROR_MESSAGES_FR: Record<ErrorCode, string> = {
  INVALID_URL: "L'adresse HomeBox est invalide ou ne correspond pas à une instance HomeBox.",
  INSECURE_URL: 'Une adresse HTTPS est obligatoire.',
  HOMEBOX_UNREACHABLE: 'HomeBox est inaccessible. Vérifiez l’adresse et votre connexion.',
  UNAUTHORIZED: 'Clé API invalide ou expirée.',
  PERMISSION_DENIED: "L'autorisation d'accès à votre instance HomeBox a été refusée.",
  NOT_AN_ORDER_PAGE: 'Aucun achat détecté sur cette page.',
  PRODUCT_NOT_FOUND: 'Produit impossible à identifier : complétez les informations.',
  INVOICE_MISSING: 'Aucune facture détectée.',
  INVOICE_UNAVAILABLE: "La facture n'est pas encore disponible pour cette commande.",
  DOWNLOAD_REFUSED: 'Le téléchargement de la facture a été refusé (session Amazon expirée ?).',
  NOT_A_PDF: "Le fichier n'est pas un PDF.",
  FILE_TOO_LARGE: 'Le fichier dépasse 15 Mo.',
  DUPLICATE_SUSPECTED: 'Un objet semblable existe déjà dans HomeBox.',
  DUPLICATE_CHECK_FAILED: "La vérification des doublons n'a pas pu être effectuée.",
  CREATE_FAILED: "La création de l'objet dans HomeBox a échoué.",
  UPDATE_FAILED: "L'objet a été créé mais les informations d'achat n'ont pas été enregistrées.",
  ATTACHMENT_FAILED: "L'objet a été créé mais l'envoi de la facture a échoué.",
  MANUAL_FILE_REQUIRED: 'Sélectionnez à nouveau le fichier à joindre pour réessayer.',
  NOT_CONFIGURED: "Configurez d'abord votre instance HomeBox.",
  BAD_MESSAGE: 'Erreur interne de l’extension.',
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorCode; httpStatus?: number };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: ErrorCode, httpStatus?: number): Result<T> =>
  httpStatus === undefined ? { ok: false, error } : { ok: false, error, httpStatus };
