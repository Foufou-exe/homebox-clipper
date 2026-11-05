import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { AttachmentUpload, TreeItem } from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { bytesToBase64 } from '@/shared/pdf';
import type { FetchedPhoto } from '@/background/import/photo-fetch';
import type { DocumentRef, DraftPhoto, ImportDraft, PendingImport } from '@/shared/types';

export const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
export const PDF_B64 = bytesToBase64(PDF);

export const invoice: DocumentRef = {
  id: 'detected-0',
  origin: 'detected',
  kind: 'invoice',
  label: 'facture-amazon-999-0000000-0000001.pdf',
  url: 'https://www.amazon.fr/documents/download/x/invoice.pdf',
};

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
export const photoOk: FetchedPhoto = { bytes: JPEG, mimeType: 'image/jpeg', filename: 'photo-produit.jpg' };

/** Photo proposée par défaut pour les tests de la photo ; `draft()` n'en a pas (aucun test existant n'est affecté). */
export function draftPhoto(over: Partial<DraftPhoto> = {}): DraftPhoto {
  return { url: 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg', merchantId: 'amazon.fr', include: true, ...over };
}

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
    photo: null,
    location: null,
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
  get?: Step<{ id: string; name: string; attachments?: { id: string; type?: string; primary?: boolean }[] }>[];
  /** Arbre des emplacements renvoyé par `listLocations` (vide par défaut). */
  tree?: Step<TreeItem[]>[];
}) {
  let n = 0;
  const take = <T>(queue: Step<T>[] | undefined, fallback: () => Result<T>) => {
    const next = queue?.shift();
    return Promise.resolve(next ? resolve(next) : fallback());
  };
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: vi.fn((data?: { name: string; description?: string }) => {
      void data;
      return take(script.create, () => ok({ id: `e${++n}`, name: 'x' }));
    }),
    updateEntity: vi.fn((id: string, data?: unknown) => {
      void data;
      return take(script.update, () => ok({ id, name: 'x' }));
    }),
    getEntity: vi.fn((id: string) => take(script.get, () => ok({ id, name: 'x' }))),
    addAttachment: vi.fn((id: string, file: AttachmentUpload) => {
      void id;
      void file;
      return take(script.attach, () => ok(undefined));
    }),
    listLocations: vi.fn(() => take(script.tree, () => ok([] as TreeItem[]))),
    searchEntities: vi.fn(),
    getStatus: vi.fn(),
    checkAuth: vi.fn(),
  };
  return client;
}

export const err = (code: ErrorCode, status?: number) => fail(code, status);

export function setup(
  script: Parameters<typeof fakeClient>[0] = {},
  download?: () => Result<{ base64: string }>,
  photo?: () => Result<FetchedPhoto>,
) {
  fakeBrowser.reset();
  const client = fakeClient(script);
  const notified: PendingImport['status'][] = [];
  const downloadDetected = vi.fn(async () => (download ? download() : ok({ base64: PDF_B64 })));
  const fetchPhoto = vi.fn(async (p: DraftPhoto) => {
    void p;
    return photo ? photo() : ok(photoOk);
  });
  const rememberLocation = vi.fn(async (id: string) => {
    void id;
  });
  let id = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected,
    fetchPhoto,
    rememberLocation,
    notify: (p) => notified.push(p.status),
    newId: () => `p${++id}`,
  });
  return { client, orchestrator, notified, downloadDetected, fetchPhoto, rememberLocation };
}

export const sessionKeys = async () => Object.keys(await fakeBrowser.storage.session.get(null));
