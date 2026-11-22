/**
 * HomeBox bounds custom field names (255) and values (500) in UTF-8 bytes, not characters (#116).
 * One shared counter for the summary and the message validators.
 */
const encoder = new TextEncoder();

export const utf8ByteLength = (s: string): number => encoder.encode(s).length;

/** HomeBox `MaxLen(255)` on a custom field name, in bytes. */
export const MAX_FIELD_NAME_BYTES = 255;
/** HomeBox `MaxLen(500)` on a custom field text value, in bytes. */
export const MAX_FIELD_TEXT_BYTES = 500;
