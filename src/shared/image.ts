export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ImageKind {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Without the dot, for the name of the uploaded file. */
  extension: 'jpg' | 'png' | 'webp';
}

/**
 * True if the URL is https, with no port or credentials, and its host is strictly equal to an entry of
 * `hosts` (R6). No suffix or wildcard: the URL comes from a web page, so it is untrusted.
 */
export function isAllowedImageUrl(url: string, hosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    hosts.includes(parsed.hostname)
  );
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP", after 4 size bytes

/**
 * Format decided by the byte signature (R7): JPEG, PNG or WebP, otherwise `null` (SVG, GIF, HTML, PDF…).
 * Does not decode the image.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, JPEG)) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(bytes, PNG)) return { mimeType: 'image/png', extension: 'png' };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}
