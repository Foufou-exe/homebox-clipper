import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { bytesToBase64 } from '@/shared/pdf';
import type { DocumentRef, ImportDraft, PendingImport } from '@/shared/types';

export const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
export const PDF_B64 = bytesToBase64(PDF);

export const invoice: DocumentRef = {
  id: 'detected-0',
  origin: 'detected',
  kind: 'invoice',
  label: 'facture-amazon-999-0000000-0000001.pdf',
  url: 'https://www.amazon.fr/documents/download/x/invoice.pdf',
};

export function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    name: 'Clavier sans fil Exemple Pro',
    description: 'Acheté sur Amazon.fr le 22/10/2026',
    purchasePrice: 99.99,
    currency: 'EUR',
    purchaseDate: '2026-10-22',
    purchaseFrom: 'Amazon.fr',
    orderNumber: '999-0000000-0000001',
    quantity: 1,
    pageUrl: 'https://www.amazon.fr/your-orders/order-details',
    documents: [invoice],
    ...overrides,
  };
}

type Step<T> = Result<T> | (() => Result<T>);
const resolve = <T>(s: Step<T>) => (typeof s === 'function' ? s() : s);

/** Client HomeBox simulé dont chaque méthode consomme une file de réponses. */
export function fakeClient(script: {
  create?: Step<{ id: string; name: string }>[];
  update?: Step<{ id: string; name: string }>[];
  attach?: Step<void>[];
  get?: Step<{ id: string; name: string }>[];
}) {
  let n = 0;
  const take = <T>(queue: Step<T>[] | undefined, fallback: () => Result<T>) => {
    const next = queue?.shift();
    return Promise.resolve(next ? resolve(next) : fallback());
  };
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: vi.fn(() => take(script.create, () => ok({ id: `e${++n}`, name: 'x' }))),
    updateEntity: vi.fn((id: string, data?: unknown) => {
      void data;
      return take(script.update, () => ok({ id, name: 'x' }));
    }),
    getEntity: vi.fn((id: string) => take(script.get, () => ok({ id, name: 'x' }))),
    addAttachment: vi.fn(() => take(script.attach, () => ok(undefined))),
    searchEntities: vi.fn(),
    getStatus: vi.fn(),
    checkAuth: vi.fn(),
  };
  return client;
}

export const err = (code: ErrorCode, status?: number) => fail(code, status);

export function setup(script: Parameters<typeof fakeClient>[0] = {}, download?: () => Result<{ base64: string }>) {
  fakeBrowser.reset();
  const client = fakeClient(script);
  const notified: PendingImport['status'][] = [];
  const downloadDetected = vi.fn(async () => (download ? download() : ok({ base64: PDF_B64 })));
  let id = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected,
    notify: (p) => notified.push(p.status),
    newId: () => `p${++id}`,
  });
  return { client, orchestrator, notified, downloadDetected };
}

export const sessionKeys = async () => Object.keys(await fakeBrowser.storage.session.get(null));
