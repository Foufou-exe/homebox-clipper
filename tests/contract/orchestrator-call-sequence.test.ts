import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { AttachmentUpload, TreeItem } from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import type { FetchedPhoto } from '@/background/import/photo-fetch';
import { fail, ok, type Result } from '@/shared/errors';
import type { DraftPhoto, ImportDraft, PendingImport } from '@/shared/types';
import { PDF_B64, draft, draftPhoto, err, invoice, photoOk } from './orchestrator-harness';

/**
 * Golden trace of the orchestrator: every side effect (HomeBox client, store, notification, download,
 * photo, location memory), in order, with its arguments and a snapshot of the persisted state. The
 * snapshot was recorded on the code before the complexity refactoring: any change of order, of request
 * or of persisted state makes this test fail.
 */
type Script = {
  create?: Result<unknown>[];
  update?: Result<unknown>[];
  attach?: Result<void>[];
  get?: Result<unknown>[];
  tree?: Result<TreeItem[]>[];
  search?: Result<unknown[]>[];
  download?: Result<{ base64: string }>[];
  photo?: Result<FetchedPhoto>[];
};

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const upload = (f: AttachmentUpload) => ({ ...f, bytes: `<${f.bytes.length} bytes>` });

function recorder(script: Script) {
  fakeBrowser.reset();
  const trace: unknown[] = [];
  const rec = (call: string, ...args: unknown[]) => trace.push([call, ...args.map(clone)]);
  let n = 0;
  const next = <T>(queue: Result<T>[] | undefined, fallback: () => Result<T>) =>
    Promise.resolve(queue?.shift() ?? fallback());
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: async (data: unknown) => {
      rec('client.createEntity', data);
      return next(script.create, () => ok({ id: `e${++n}`, name: 'x', parent: undefined }));
    },
    updateEntity: async (id: string, data: unknown) => {
      rec('client.updateEntity', id, data);
      return next(script.update, () => ok({ id, name: 'x' }));
    },
    getEntity: async (id: string) => {
      rec('client.getEntity', id);
      return next(script.get, () => ok({ id, name: 'x' }));
    },
    addAttachment: async (id: string, file: AttachmentUpload) => {
      rec('client.addAttachment', id, upload(file));
      return next(script.attach, () => ok(undefined));
    },
    listLocations: async () => {
      rec('client.listLocations');
      return next(script.tree, () => ok([] as TreeItem[]));
    },
    searchEntities: async (q: string) => {
      rec('client.searchEntities', q);
      return next(script.search, () => ok([]));
    },
  };
  const store = {
    save: async (p: PendingImport) => {
      rec('store.save', p);
      await pendingStore.save(p);
    },
    get: async (id: string) => {
      rec('store.get', id);
      return pendingStore.get(id);
    },
    purge: async (p: PendingImport) => {
      rec('store.purge', p);
      await pendingStore.purge(p);
    },
  };
  let id = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store,
    downloadDetected: async (tabId: number, url: string) => {
      rec('downloadDetected', tabId, url);
      return script.download?.shift() ?? ok({ base64: PDF_B64 });
    },
    fetchPhoto: async (photo: DraftPhoto) => {
      rec('fetchPhoto', photo);
      return script.photo?.shift() ?? ok(photoOk);
    },
    rememberLocation: async (locationId: string) => {
      rec('rememberLocation', locationId);
    },
    notify: (p) => rec('notify', p),
    newId: () => `p${++id}`,
  });
  const result = (label: string, r: unknown) => rec(`=> ${label}`, r);
  return { orchestrator, trace, result, script };
}

const located = (over: Partial<ImportDraft> = {}) =>
  draft({ photo: draftPhoto(), location: { id: 'loc-1', path: ['Maison', 'Bureau'] }, ...over });
const tree: TreeItem[] = [{ id: 'loc-1', name: 'Bureau', type: 'location', children: [] }];
const firstId = (r: Result<PendingImport[]>) => (r.ok ? r.value[0]!.id : 'missing');

describe('orchestrator — golden call sequence (refactoring guard)', () => {
  it('1. full import with location, invoice and photo', async () => {
    const { orchestrator, trace, result } = recorder({
      create: [ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' } })],
    });
    result('start', await orchestrator.startImport(5, [located()], [], 'loc-1'));
    expect(trace).toMatchSnapshot();
  });

  it('2. invoice upload fails, then the retry attaches it', async () => {
    const { orchestrator, trace, result } = recorder({ attach: [err('ATTACHMENT_FAILED', 500)] });
    const first = await orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
    result('start', first);
    result('retry', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('3. uncertain creation (lost response), then the retry searches the name and creates', async () => {
    const { orchestrator, trace, result } = recorder({
      create: [err('HOMEBOX_UNREACHABLE')],
      search: [ok([])],
    });
    const first = await orchestrator.startImport(5, [located()], [], 'loc-1');
    result('start', first);
    result('retry', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('4. photo POST lost, the resume finds the photo already attached (no second POST)', async () => {
    const { orchestrator, trace, result } = recorder({
      attach: [ok(undefined), err('HOMEBOX_UNREACHABLE')],
      get: [
        ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'photo', primary: false }] }),
      ],
    });
    const first = await orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
    result('start', first);
    result('retry', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('5. photo POST lost, the resume does not find it and sends it again', async () => {
    const { orchestrator, trace, result } = recorder({
      attach: [ok(undefined), err('HOMEBOX_UNREACHABLE')],
      get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'receipt' }] })],
    });
    const first = await orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
    result('start', first);
    result('retry', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('6. 2xx without id and unknown location → LOCATION_NOT_FOUND, uncertain', async () => {
    const { orchestrator, trace, result } = recorder({
      create: [fail('CREATE_FAILED', 201)],
      tree: [ok([])],
    });
    result('start', await orchestrator.startImport(5, [located()], [], 'loc-1'));
    expect(trace).toMatchSnapshot();
  });

  it('7. definite 4xx with an existing location → CREATE_FAILED, not uncertain; tree unreadable → CREATE_FAILED', async () => {
    const { orchestrator, trace, result } = recorder({
      create: [fail('CREATE_FAILED', 400), fail('CREATE_FAILED', 404)],
      tree: [ok(tree), fail('LOCATIONS_UNAVAILABLE')],
    });
    const first = await orchestrator.startImport(5, [located()], []);
    result('start', first);
    result('retry', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('8. PUT failed, attachments and photo still sent; the retry re-reads then replays the PUT', async () => {
    const { orchestrator, trace, result } = recorder({
      update: [err('UNAUTHORIZED', 401)],
      attach: [err('UNAUTHORIZED', 401)],
      photo: [fail('PHOTO_NOT_IMAGE')],
      get: [err('HOMEBOX_UNREACHABLE')],
    });
    const first = await orchestrator.startImport(
      5,
      [draft({ photo: draftPhoto(), description: '', purchaseFrom: '' })],
      [],
    );
    result('start', first);
    result('retry 1', await orchestrator.retryImport(firstId(first)));
    result('retry 2', await orchestrator.retryImport(firstId(first)));
    expect(trace).toMatchSnapshot();
  });

  it('9. orphaned import whose creation was attempted: name search, duplicate found, nothing sent', async () => {
    const { orchestrator, trace, result } = recorder({
      search: [ok([{ id: 'e9', name: draft().name }])],
    });
    const orphan: PendingImport = {
      id: 'o1',
      tabId: 5,
      pageUrl: null,
      draft: draft(),
      entityId: null,
      steps: {
        create: 'pending',
        update: 'pending',
        attachments: { 'detected-0': 'pending' },
        photo: 'unavailable',
      },
      status: 'failed',
      error: null,
      photoError: null,
      photoAttempted: false,
      createAttempted: true,
      orphaned: true,
    };
    await pendingStore.save(orphan);
    result('retry', await orchestrator.retryImport('o1'));
    expect(trace).toMatchSnapshot();
  });

  it('10. orphaned import with an entity, photo step left in "sending": cleared orphan flag, re-read, resent', async () => {
    const { orchestrator, trace, result } = recorder({});
    const orphan: PendingImport = {
      id: 'o2',
      tabId: 5,
      pageUrl: null,
      draft: draft({
        photo: draftPhoto(),
        documents: [invoice, { ...invoice, id: 'detected-1', url: undefined }],
      }),
      entityId: 'e7',
      steps: {
        create: 'done',
        update: 'done',
        attachments: { 'detected-0': 'done', 'detected-1': 'pending' },
        photo: 'sending',
      },
      status: 'partial',
      error: null,
      photoError: null,
      photoAttempted: true,
      orphaned: true,
    };
    await pendingStore.save(orphan);
    result('retry', await orchestrator.retryImport('o2'));
    expect(trace).toMatchSnapshot();
  });

  it('11. two products sharing the invoice and the photo: one download each, one memory write', async () => {
    const { orchestrator, trace, result } = recorder({ download: [fail('DOWNLOAD_REFUSED')] });
    const p = draftPhoto();
    result(
      'start',
      await orchestrator.startImport(
        5,
        [located({ photo: p }), located({ name: 'Souris', photo: p })],
        [],
        'loc-1',
      ),
    );
    expect(trace).toMatchSnapshot();
  });
  it('12. photo step "pending" without a draft photo (older state): nothing fetched, success', async () => {
    const { orchestrator, trace, result } = recorder({});
    const stale: PendingImport = {
      id: 'o3',
      tabId: 5,
      pageUrl: null,
      draft: draft({ photo: null, documents: [] }),
      entityId: 'e3',
      steps: { create: 'done', update: 'done', attachments: {}, photo: 'pending' },
      status: 'partial',
      error: 'PHOTO_UPLOAD_FAILED',
      photoError: 'PHOTO_UPLOAD_FAILED',
      photoAttempted: false,
    };
    await pendingStore.save(stale);
    result('retry', await orchestrator.retryImport('o3'));
    expect(trace).toMatchSnapshot();
  });

  it('13. manual document without its file at start: MANUAL_FILE_REQUIRED, no request for it', async () => {
    const { orchestrator, trace, result } = recorder({});
    const manual = {
      id: 'manual-1',
      origin: 'manual' as const,
      kind: 'order_document' as const,
      label: 'bon',
    };
    result(
      'start',
      await orchestrator.startImport(5, [draft({ documents: [manual, invoice] })], []),
    );
    expect(trace).toMatchSnapshot();
  });
});
