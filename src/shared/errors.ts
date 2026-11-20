/** The error codes; the displayed text comes from the catalog (`error.<CODE>`, src/locales/*.yml). */
export const ERROR_CODES = [
  'INVALID_URL',
  'INSECURE_URL',
  'HOMEBOX_UNREACHABLE',
  'UNAUTHORIZED',
  'PERMISSION_DENIED',
  'NOT_AN_ORDER_PAGE',
  'PRODUCT_NOT_FOUND',
  'INVOICE_MISSING',
  'INVOICE_UNAVAILABLE',
  'DOWNLOAD_REFUSED',
  'NOT_A_PDF',
  'FILE_TOO_LARGE',
  'DUPLICATE_SUSPECTED',
  'DUPLICATE_CHECK_FAILED',
  'CREATE_FAILED',
  'UPDATE_FAILED',
  'ATTACHMENT_FAILED',
  'PHOTO_UNAVAILABLE',
  'PHOTO_NOT_IMAGE',
  'PHOTO_TOO_LARGE',
  'PHOTO_UPLOAD_FAILED',
  'LOCATIONS_UNAVAILABLE',
  'LOCATION_NOT_FOUND',
  'TAGS_UNAVAILABLE',
  'TAG_FAILED',
  'MANUAL_FILE_REQUIRED',
  'NOT_CONFIGURED',
  'LOCKED',
  'WRONG_PASSPHRASE',
  'WEAK_PASSPHRASE',
  'BAD_MESSAGE',
  // Spec 016 (multiple instances): the UI names the instance, the service worker only returns the code.
  'INSTANCE_NOT_FOUND',
  'KEY_UNREADABLE',
  'INSTANCE_LIMIT',
  'INSTANCE_EXISTS',
  'INSTANCE_NAME_INVALID',
  'INSTANCE_NAME_TAKEN',
  'INSTANCE_BUSY',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorCode; httpStatus?: number };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: ErrorCode, httpStatus?: number): Result<T> =>
  httpStatus === undefined ? { ok: false, error } : { ok: false, error, httpStatus };
