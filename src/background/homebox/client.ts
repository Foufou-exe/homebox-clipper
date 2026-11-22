import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { log } from '@/shared/logger';
import type {
  AttachmentUpload,
  EntityCreate,
  EntityField,
  EntityOut,
  EntitySummary,
  EntityUpdate,
  StatusOut,
  TagCreate,
  TagSummary,
  TemplateCreateItem,
  TemplateOut,
  TemplateSummary,
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

/** Entry of a tag list or created tag with a textual `id` and `name`, reduced to these two fields; otherwise `null`. */
function toTagSummary(x: unknown): TagSummary | null {
  if (typeof x !== 'object' || x === null) return null;
  const { id, name } = x as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null;
}

/** Entry of a template list with a textual `id` and `name` (spec 018); other fields kept only if textual. */
function toTemplateSummary(x: unknown): TemplateSummary | null {
  if (typeof x !== 'object' || x === null) return null;
  const { id, name, description, updatedAt } = x as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return {
    id,
    name,
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
  };
}

/** A non-2xx HTTP status that `request` mapped to a generic code: 404 gets its own code (same technique as 422). */
function on404<T>(res: Result<T>, code: ErrorCode): Result<T> {
  return !res.ok && res.httpStatus === 404 ? fail(code, 404) : res;
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

    /** GET /tags (spec 014): malformed entries are ignored; a non-array answer is `TAGS_UNAVAILABLE`. No name is logged. */
    async listTags(): Promise<Result<TagSummary[]>> {
      const res = await request('GET', '/tags', {
        auth: true,
        endpoint: 'GET /tags',
        onHttpError: 'TAGS_UNAVAILABLE',
      });
      const json = await readJson<unknown>(res, 'TAGS_UNAVAILABLE');
      if (!json.ok) return json;
      if (!Array.isArray(json.value)) return fail('TAGS_UNAVAILABLE');
      return ok(json.value.flatMap((x) => toTagSummary(x) ?? []));
    },

    /**
     * POST /tags (spec 014): the body is exactly `{ name }` (no color, icon, description or parent). An answer
     * without textual `id` and `name` is `TAG_FAILED`. No name is logged.
     */
    async createTag(name: string): Promise<Result<TagSummary>> {
      const body: TagCreate = { name };
      const res = await request('POST', '/tags', {
        auth: true,
        endpoint: 'POST /tags',
        onHttpError: 'TAG_FAILED',
        json: body,
      });
      const json = await readJson<unknown>(res, 'TAG_FAILED');
      if (!json.ok) return json;
      const tag = toTagSummary(json.value);
      if (tag) return ok(tag);
      const status = res.ok ? res.value.status : undefined;
      return fail('TAG_FAILED', status);
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

    /** `pageSize` 20 by default (certain duplicate, uncertain creation); 50 for the similar-name words (spec 015). */
    async searchEntities(q: string, pageSize = 20): Promise<Result<EntitySummary[]>> {
      const params = new URLSearchParams({ q, pageSize: String(pageSize) });
      const res = await request('GET', `/entities?${params.toString()}`, {
        auth: true,
        endpoint: 'GET /entities?q',
        onHttpError: 'DUPLICATE_CHECK_FAILED',
      });
      const json = await readJson<{ items?: EntitySummary[] }>(res, 'DUPLICATE_CHECK_FAILED');
      if (!json.ok) return json;
      return ok(Array.isArray(json.value.items) ? json.value.items : []);
    },

    /**
     * Exact server-side filter on a custom field (spec 020): `GET /entities?fields=<name>=<value>`. HomeBox matches
     * the name and the text value exactly (case-sensitive). The field name and the value are never logged: only the
     * endpoint template is.
     */
    async searchEntitiesByField(name: string, value: string, pageSize = 20): Promise<Result<EntitySummary[]>> {
      const params = new URLSearchParams({ fields: `${name}=${value}`, pageSize: String(pageSize) });
      const res = await request('GET', `/entities?${params.toString()}`, {
        auth: true,
        endpoint: 'GET /entities?fields',
        onHttpError: 'DUPLICATE_CHECK_FAILED',
      });
      const json = await readJson<{ items?: EntitySummary[] }>(res, 'DUPLICATE_CHECK_FAILED');
      if (!json.ok) return json;
      return ok(Array.isArray(json.value.items) ? json.value.items : []);
    },

    /**
     * GET /templates (spec 018): read-only. Entries without textual `id` and `name` are ignored; 404 means an
     * instance without templates (`TEMPLATES_UNSUPPORTED`). No template name is logged.
     */
    async listTemplates(): Promise<Result<TemplateSummary[]>> {
      const res = on404(
        await request('GET', '/templates', { auth: true, endpoint: 'GET /templates', onHttpError: 'TEMPLATES_UNAVAILABLE' }),
        'TEMPLATES_UNSUPPORTED',
      );
      const json = await readJson<unknown>(res, 'TEMPLATES_UNAVAILABLE');
      if (!json.ok) return json;
      if (!Array.isArray(json.value)) return fail('TEMPLATES_UNAVAILABLE');
      return ok(json.value.flatMap((x) => toTemplateSummary(x) ?? []));
    },

    /**
     * GET /entities/fields (spec 019, contracts/homebox-fields.md §1): the custom field names of the instance, for the
     * suggestions; never their values (the route of the values is never called). Non-textual entries are ignored;
     * `null` (Go nil slice) is an empty list; another shape, 404 (version without the route) or another error is
     * `FIELD_NAMES_UNAVAILABLE`. No name is logged.
     */
    async listFieldNames(): Promise<Result<string[]>> {
      const res = await request('GET', '/entities/fields', {
        auth: true,
        endpoint: 'GET /entities/fields',
        onHttpError: 'FIELD_NAMES_UNAVAILABLE',
      });
      const json = await readJson<unknown>(res, 'FIELD_NAMES_UNAVAILABLE');
      if (!json.ok) return json;
      if (json.value === null) return ok([]);
      if (!Array.isArray(json.value)) return fail('FIELD_NAMES_UNAVAILABLE', res.ok ? res.value.status : undefined);
      return ok(json.value.filter((x): x is string => typeof x === 'string'));
    },

    /** GET /templates/{id} (spec 018): read-only; 404 → `TEMPLATE_NOT_FOUND`. The id is never logged. */
    async getTemplate(id: string): Promise<Result<TemplateOut>> {
      const res = on404(
        await request('GET', `/templates/${encodeURIComponent(id)}`, {
          auth: true,
          endpoint: 'GET /templates/{id}',
          onHttpError: 'TEMPLATES_UNAVAILABLE',
        }),
        'TEMPLATE_NOT_FOUND',
      );
      const json = await readJson<TemplateOut>(res, 'TEMPLATES_UNAVAILABLE');
      if (!json.ok) return json;
      const value = json.value as unknown;
      if (typeof value !== 'object' || value === null || typeof (value as { id?: unknown }).id !== 'string') {
        return fail('TEMPLATES_UNAVAILABLE');
      }
      return json;
    },

    /**
     * POST /templates/{id}/create-item (spec 018, research D2): the body is exactly `{ name, description?, quantity,
     * parentId }` (never `locationId`, `tagIds` or `entityTypeId`). Failures as `createEntity`: an unreadable 2xx
     * answer or one without `id` is `CREATE_FAILED` with the 2xx status (uncertain creation).
     */
    async createFromTemplate(id: string, data: TemplateCreateItem): Promise<Result<EntityOut>> {
      const body: TemplateCreateItem = {
        name: data.name,
        ...(data.description ? { description: data.description } : {}),
        quantity: data.quantity,
        parentId: data.parentId,
      };
      const res = await request('POST', `/templates/${encodeURIComponent(id)}/create-item`, {
        auth: true,
        endpoint: 'POST /templates/{id}/create-item',
        onHttpError: 'CREATE_FAILED',
        json: body,
      });
      const json = await readJson<EntityOut>(res, 'CREATE_FAILED');
      if (json.ok && typeof json.value?.id !== 'string') return fail('CREATE_FAILED', res.ok ? res.value.status : undefined);
      return json;
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

/** Only the properties `EntityUpdate.fields` accepts (Swagger `repo.EntityFieldData`). */
function copyField(f: EntityField): EntityField {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    textValue: f.textValue,
    numberValue: f.numberValue,
    booleanValue: f.booleanValue,
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
    // The PUT replaces the custom fields: send the current ones back, only when there are some.
    fields: Array.isArray(out.fields) && out.fields.length > 0 ? out.fields.map(copyField) : undefined,
  };
  const merged = { ...base, ...patch, id: out.id };
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as unknown as EntityUpdate;
}

/**
 * Full PUT of an EXISTING item chosen by the user (spec 021, contracts/homebox-completion.md §3): every property of
 * the item read just before, including the sale details and the location sync that `entityOutToUpdate` (creation
 * path, unchanged) does not copy, plus `patch`. The caller only puts additions in `patch`.
 */
export function preservingUpdate(out: EntityOut, patch: Partial<EntityUpdate>): EntityUpdate {
  return entityOutToUpdate(out, {
    soldDate: out.soldDate,
    soldTo: out.soldTo,
    soldPrice: out.soldPrice,
    soldNotes: out.soldNotes,
    syncChildEntityLocations: out.syncChildEntityLocations,
    ...patch,
  });
}
