import type { ErrorCode } from './errors';

/**
 * The only access point to the console (R14, principle I).
 * The signature is closed: no arbitrary value (key, purchase data) can be logged.
 */
export interface LogMeta {
  code?: ErrorCode;
  status?: number;
  ms?: number;
  /** Endpoint template, e.g. `POST /entities/{id}/attachments` — never a real URL. */
  endpoint?: string;
}

export function log(event: string, meta: LogMeta = {}): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[homebox-clipper] ${event}`, meta);
}

export function logError(event: string, meta: LogMeta = {}): void {
  console.warn(`[homebox-clipper] ${event}`, meta);
}
