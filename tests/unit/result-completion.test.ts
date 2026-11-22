import { mount } from '@vue/test-utils';
import type { InstanceView, PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft, invoice } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

// Spec 021 (contracts/ui-completion.md §4, R1 to R3): the result of a product completed instead of created.
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(async () => ({ ok: true, value: { locations: [], lastUsedId: null } })),
}));

const fr = loadCatalog('fr');
const A: InstanceView = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••a1b2',
  lastCheck: null,
  keyState: 'ready',
};
const B: InstanceView = {
  ...A,
  id: 'inst-b',
  name: 'Bureau',
  baseUrl: 'https://homebox-b.example.com',
};

function completed(over: Partial<PendingImport> = {}): PendingImport {
  return {
    id: 'p1',
    tabId: 1,
    pageUrl: null,
    draft: draft({
      location: null,
      complete: {
        entityId: 'item-1',
        itemName: 'Clavier (HomeBox)',
        keys: ['doc:detected-0', 'purchasePrice'],
      },
    }),
    entityId: 'item-1',
    steps: {
      create: 'done',
      update: 'done',
      attachments: { [invoice.id]: 'done' },
      photo: 'not_requested',
    },
    status: 'success',
    error: null,
    photoError: null,
    photoAttempted: false,
    instanceId: 'inst-b',
    completion: { skipped: [], present: [] },
    ...over,
  };
}

describe('ResultView: a completed item (021, R1)', () => {
  it('R1: "objet existant complété" and a link to the item on the instance of the import', () => {
    const w = mount(ResultView, {
      props: { pendings: [completed()], instances: [A, B], running: false },
    });
    expect(w.text()).toContain(fr['result.completed']);
    const link = w.find('a');
    expect(link.attributes('href')).toBe('https://homebox-b.example.com/item/item-1');
    expect(link.text()).toBe(fr['result.openInHomebox']);
  });

  it('while running: "Mise à jour de l’objet existant", no "Création de l’objet" step', () => {
    const running = completed({
      status: 'running',
      steps: {
        create: 'done',
        update: 'pending',
        attachments: { [invoice.id]: 'pending' },
        photo: 'not_requested',
      },
    });
    const w = mount(ResultView, {
      props: { pendings: [running], instances: [A, B], running: true },
    });
    expect(w.text()).toContain(fr['result.stepComplete']!.replace('$1', fr['result.stepPending']!));
    expect(w.text()).not.toContain(fr['result.stepCreate']!.replace('$1', ''));
  });

  it('a created item keeps the result of today (no "completed" mention)', () => {
    const created = completed({ draft: draft(), completion: undefined });
    const w = mount(ResultView, {
      props: { pendings: [created], instances: [A, B], running: false },
    });
    expect(w.text()).not.toContain(fr['result.completed']);
  });
});

describe('ResultView: what a completion did not write (021, R2)', () => {
  it('R2: skipped, present and noChange are shown, by name, never with a value of the item', () => {
    const p = completed({
      draft: draft({
        documents: [invoice],
        location: null,
        complete: {
          entityId: 'item-1',
          itemName: 'Clavier (HomeBox)',
          keys: ['doc:detected-0', 'purchasePrice', 'notes'],
        },
      }),
      completion: { skipped: ['purchasePrice', 'notes'], present: ['detected-0'], noChange: true },
    });
    const w = mount(ResultView, { props: { pendings: [p], instances: [A, B], running: false } });
    const text = w.text();
    expect(text).toContain(fr['result.noChange']);
    expect(text).toContain(
      fr['result.skipped']!.replace(
        '$1',
        `${fr['completion.name.purchasePrice']}, ${fr['completion.name.notes']}`,
      ),
    );
    expect(text).toContain(fr['result.present']!.replace('$1', invoice.label));
  });

  it('a partial completion shows the same mentions next to the resume', () => {
    const p = completed({
      status: 'partial',
      error: 'ATTACHMENT_FAILED',
      steps: {
        create: 'done',
        update: 'done',
        attachments: { [invoice.id]: 'failed' },
        photo: 'not_requested',
      },
      completion: { skipped: ['purchasePrice'], present: [] },
    });
    const w = mount(ResultView, { props: { pendings: [p], instances: [A, B], running: false } });
    expect(w.text()).toContain(
      fr['result.skipped']!.replace('$1', fr['completion.name.purchasePrice']!),
    );
  });
});

describe('ResultView: a partial completion (021, R3)', () => {
  it('R3: the resume is offered without any location picker; the item is linked', async () => {
    const { default: LocationPicker } = await import('@/ui/components/LocationPicker.vue');
    const p = completed({
      status: 'partial',
      error: 'ATTACHMENT_FAILED',
      steps: {
        create: 'done',
        update: 'done',
        attachments: { [invoice.id]: 'failed' },
        photo: 'not_requested',
      },
    });
    const w = mount(ResultView, { props: { pendings: [p], instances: [A, B], running: false } });
    expect(w.findComponent(LocationPicker).exists()).toBe(false);
    expect(w.find('select').exists()).toBe(false);
    expect(w.findAll('button').length).toBeGreaterThan(0);
    expect(
      w
        .findAll('a')
        .some((a) => a.attributes('href') === 'https://homebox-b.example.com/item/item-1'),
    ).toBe(true);
  });
});

describe('ResultView: a completion is never presented as a creation (021, review I1)', () => {
  const created = (id: string): PendingImport => ({
    ...completed({ id }),
    draft: draft(),
    completion: undefined,
  });

  it('partial completion: existing item wording with the HomeBox name, completion error texts', () => {
    const p = completed({
      status: 'partial',
      error: 'ATTACHMENT_FAILED',
      photoError: 'PHOTO_UPLOAD_FAILED',
      steps: {
        create: 'done',
        update: 'done',
        attachments: { [invoice.id]: 'failed' },
        photo: 'failed',
      },
    });
    const w = mount(ResultView, { props: { pendings: [p], instances: [A, B], running: false } });
    const text = w.text();
    expect(text).toContain(fr['completion.recoveryPartial']!.replace('$1', 'Clavier (HomeBox)'));
    expect(text).toContain(fr['completion.error.ATTACHMENT_FAILED']);
    expect(text).toContain(fr['completion.error.PHOTO_UPLOAD_FAILED']);
    expect(text).not.toContain(fr['recovery.created']);
    expect(text).not.toContain(fr['error.ATTACHMENT_FAILED']);
  });

  it.each(['UPDATE_FAILED', 'TAG_FAILED', 'ORDER_FIELDS_FAILED'] as const)(
    '%s: completion text, never "created"',
    (code) => {
      const p = completed({
        status: 'partial',
        error: code,
        steps: { create: 'done', update: 'failed', attachments: {}, photo: 'not_requested' },
      });
      const text = mount(ResultView, {
        props: { pendings: [p], instances: [A, B], running: false },
      }).text();
      expect(text).toContain(fr[`completion.error.${code}`]);
      expect(text).not.toContain(fr[`error.${code}`]);
    },
  );

  it('a created item keeps the generic error and the "created" wording', () => {
    const p = { ...created('p2'), status: 'partial' as const, error: 'ATTACHMENT_FAILED' as const };
    const text = mount(ResultView, {
      props: { pendings: [p], instances: [A, B], running: false },
    }).text();
    expect(text).toContain(fr['error.ATTACHMENT_FAILED']);
    expect(text).toContain(fr['recovery.created']);
  });

  it('ITEM_NOT_FOUND: "no longer exists", only "Abandonner", no retry, no link to the deleted item', () => {
    const p = completed({
      status: 'failed',
      error: 'ITEM_NOT_FOUND',
      steps: {
        create: 'done',
        update: 'failed',
        attachments: { [invoice.id]: 'pending' },
        photo: 'not_requested',
      },
    });
    const w = mount(ResultView, { props: { pendings: [p], instances: [A, B], running: false } });
    expect(w.text()).toContain(fr['completion.recoveryGone']!.replace('$1', 'Clavier (HomeBox)'));
    expect(w.findAll('button').map((b) => b.text())).toEqual([fr['recovery.abandon']]);
    expect(w.findAll('a').some((a) => a.attributes('href')?.includes('/item/item-1'))).toBe(false);
  });

  it('title: completed only, created only, or both', () => {
    const one = mount(ResultView, {
      props: { pendings: [completed()], instances: [A, B], running: false },
    });
    expect(one.find('.success').text()).toBe(fr['result.completedOne']);
    const two = mount(ResultView, {
      props: {
        pendings: [completed({ id: 'a' }), completed({ id: 'b' })],
        instances: [A, B],
        running: false,
      },
    });
    expect(two.find('.success').text()).toBe(fr['result.completedMany']!.replace('$1', '2'));
    const mixed = mount(ResultView, {
      props: {
        pendings: [created('c'), completed({ id: 'd' })],
        instances: [A, B],
        running: false,
      },
    });
    expect(mixed.find('.success').text()).toBe(
      fr['result.addedAndCompleted']!.replace('$1', '1').replace('$2', '1'),
    );
    const plain = mount(ResultView, {
      props: { pendings: [created('e')], instances: [A, B], running: false },
    });
    expect(plain.find('.success').text()).toBe(fr['result.addedOne']);
  });
});
