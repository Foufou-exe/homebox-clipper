import type { ErrorCode } from './errors';

/**
 * Seul point d'accès à la console (R14, principe I).
 * La signature est fermée : aucune valeur arbitraire (clé, données d'achat) ne peut être journalisée.
 */
export interface LogMeta {
  code?: ErrorCode;
  status?: number;
  ms?: number;
  /** Gabarit d'endpoint, ex. `POST /entities/{id}/attachments` — jamais d'URL réelle. */
  endpoint?: string;
}

export function log(event: string, meta: LogMeta = {}): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[homebox-clipper] ${event}`, meta);
}

export function logError(event: string, meta: LogMeta = {}): void {
  console.warn(`[homebox-clipper] ${event}`, meta);
}
