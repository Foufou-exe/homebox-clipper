import { vi } from 'vitest';

export interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type Responder = (call: Call) => Response | Promise<Response>;

/** fetch simulé : chaque appel est enregistré et servi par le prochain répondeur. */
export function mockFetch(...responders: Responder[]) {
  const calls: Call[] = [];
  const queue = [...responders];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    };
    calls.push(call);
    const next = queue.shift();
    if (!next) throw new Error(`appel fetch inattendu : ${call.method} ${call.url}`);
    return next(call);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

export const json = (status: number, body: unknown): Responder => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const html = (status: number, body = '<html></html>'): Responder => () =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

export const networkError = (): Responder => () => {
  throw new TypeError('Failed to fetch');
};

export const timeout = (): Responder => () => {
  throw new DOMException('The operation timed out.', 'TimeoutError');
};
