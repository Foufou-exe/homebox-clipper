import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { log } from '@/shared/logger';
import type {
  AttachmentUpload,
  EntityCreate,
  EntityOut,
  EntitySummary,
  EntityUpdate,
  StatusOut,
  TreeItem,
} from './types';

export const REQUEST_TIMEOUT_MS = 15_000;

export interface HomeBoxClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  auth: boolean;
  /** Template logged in place of the real URL. */
  endpoint: string;
  /** Code returned for a non-2xx HTTP status other than 401/403. */
  onHttpError: ErrorCode;
  json?: unknown;
  form?: FormData;
}

export type HomeBoxClient = ReturnType<typeof createHomeBoxClient>;

export function itemUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/item/${encodeURIComponent(id)}`;
}

async function readJson<T>(res: Result<Response>, onInvalid: ErrorCode): Promise<Result<T>> {
  if (!res.ok) return res;
  try {
    return ok((await res.value.json()) as T);
  } catch {
    return fail(onInvalid, res.value.status);
  }
}

export function createHomeBoxClient({ baseUrl, apiKey, fetchImpl }: HomeBoxClientOptions) {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const apiRoot = `${baseUrl}/api/v1`;

  async function request(method: string, path: string, opts: RequestOptions): Promise<Result<Response>> {
    const url = `${apiRoot}${path}`;
    const headers = new Headers({ Accept: 'application/json' });
    // Principle I: the key is only sent to the configured instance.
    if (opts.auth && url.startsWith(`${baseUrl}/`)) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }
    let body: BodyInit | undefined;
    if (opts.form) {
      body = opts.form;
    } else if (opts.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(opts.json);
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body,
        credentials: 'omit',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      log('homebox request failed', { endpoint: opts.endpoint, code: 'HOMEBOX_UNREACHABLE' });
      return fail('HOMEBOX_UNREACHABLE');
    }
    log('homebox request', { endpoint: opts.endpoint, status: response.status, ms: Date.now() - started });

    if (response.status === 401 || response.status === 403) {
      return fail('UNAUTHORIZED', response.status);
    }
    if (!response.ok) return fail(opts.onHttpError, response.status);
    return ok(response);
  }

  return {
    baseUrl,

    /** GET /status (public): checks that the URL points to a HomeBox instance. */
    async getStatus(): Promise<Result<{ version: string; title?: string }>> {
      const res = await request('GET', '/status', {
        auth: false,
        endpoint: 'GET /status',
        onHttpError: 'INVALID_URL',
      });
      const json = await readJson<StatusOut>(res, 'INVALID_URL');
      if (!json.ok) return json;
      if (typeof json.value !== 'object' || json.value === null || !('health' in json.value)) {
        return fail('INVALID_URL');
      }
      const version = (json.value.build?.version ?? '').replace(/^v/, '') || 'inconnue';
      return ok({ version, title: json.value.title });
    },

    /** GET /users/self: checks the API key. */
    async checkAuth(): Promise<Result<void>> {
      const res = await request('GET', '/users/self', {
        auth: true,
        endpoint: 'GET /users/self',
        onHttpError: 'INVALID_URL',
      });
      return res.ok ? ok(undefined) : res;
    },

    async createEntity(data: EntityCreate): Promise<Result<EntityOut>> {
      const res = await request('POST', '/entities', {
        auth: true,
        endpoint: 'POST /entities',
        onHttpError: 'CREATE_FAILED',
        json: data,
      });
      const json = await readJson<EntityOut>(res, 'CREATE_FAILED');
      if (json.ok && typeof json.value?.id !== 'string') return fail('CREATE_FAILED', res.ok ? res.value.status : undefined);
      return json;
    },

    /** GET /entities/tree (without `withItems`): location tree. No name is logged. */
    async listLocations(): Promise<Result<TreeItem[]>> {
      const res = await request('GET', '/entities/tree', {
        auth: true,
        endpoint: 'GET /entities/tree',
        onHttpError: 'LOCATIONS_UNAVAILABLE',
      });
      const json = await readJson<unknown>(res, 'LOCATIONS_UNAVAILABLE');
      if (!json.ok) return json;
      return Array.isArray(json.value) ? ok(json.value as TreeItem[]) : fail('LOCATIONS_UNAVAILABLE');
    },

    async getEntity(id: string): Promise<Result<EntityOut>> {
      const res = await request('GET', `/entities/${encodeURIComponent(id)}`, {
        auth: true,
        endpoint: 'GET /entities/{id}',
        onHttpError: 'UPDATE_FAILED',
      });
      return readJson<EntityOut>(res, 'UPDATE_FAILED');
    },

    /** Full PUT: `data` must contain all the fields to keep. */
    async updateEntity(id: string, data: EntityUpdate): Promise<Result<EntityOut>> {
      const res = await request('PUT', `/entities/${encodeURIComponent(id)}`, {
        auth: true,
        endpoint: 'PUT /entities/{id}',
        onHttpError: 'UPDATE_FAILED',
        json: data,
      });
      return readJson<EntityOut>(res, 'UPDATE_FAILED');
    },

    async searchEntities(q: string): Promise<Result<EntitySummary[]>> {
      const params = new URLSearchParams({ q, pageSize: '20' });
      const res = await request('GET', `/entities?${params.toString()}`, {
        auth: true,
        endpoint: 'GET /entities?q',
        onHttpError: 'DUPLICATE_CHECK_FAILED',
      });
      const json = await readJson<{ items?: EntitySummary[] }>(res, 'DUPLICATE_CHECK_FAILED');
      if (!json.ok) return json;
      return ok(Array.isArray(json.value.items) ? json.value.items : []);
    },

    async addAttachment(id: string, file: AttachmentUpload): Promise<Result<void>> {
      const form = new FormData();
      form.append('file', new Blob([file.bytes as BlobPart], { type: file.mimeType }), file.filename);
      form.append('name', file.filename);
      form.append('type', file.type);
      if (file.primary) form.append('primary', 'true');
      const res = await request('POST', `/entities/${encodeURIComponent(id)}/attachments`, {
        auth: true,
        endpoint: 'POST /entities/{id}/attachments',
        onHttpError: 'ATTACHMENT_FAILED',
        form,
      });
      return res.ok ? ok(undefined) : res;
    },
  };
}

/** Builds a full PUT from the created object, so nothing gets overwritten (R1). */
export function entityOutToUpdate(out: EntityOut, patch: Partial<EntityUpdate>): EntityUpdate {
  const base: EntityUpdate = {
    id: out.id,
    name: out.name,
    description: out.description,
    quantity: out.quantity,
    manufacturer: out.manufacturer,
    modelNumber: out.modelNumber,
    serialNumber: out.serialNumber,
    assetId: out.assetId,
    insured: out.insured,
    lifetimeWarranty: out.lifetimeWarranty,
    archived: out.archived,
    notes: out.notes,
    purchaseFrom: out.purchaseFrom,
    purchasePrice: out.purchasePrice,
    purchaseDate: out.purchaseDate,
    warrantyDetails: out.warrantyDetails,
    warrantyExpires: out.warrantyExpires,
    // `location` is resolved and read-only (inherited from the parent): copying it would pin the location.
    locationId: out.locationId,
    parentId: out.parent?.id,
    entityTypeId: out.entityType?.id,
    tagIds: out.tags?.map((t) => t.id),
  };
  const merged = { ...base, ...patch, id: out.id };
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as unknown as EntityUpdate;
}
