import { preservingUpdate } from '@/background/homebox/client';
import { orderNoteLine } from '@/background/import/completion';
import type { ImportDraft } from '@/shared/types';
import {
  ITEM_ID,
  NUMBER,
  completeDraft,
  completionSetup,
  existing,
  firstOf,
} from './completion-harness';
import { draft } from './orchestrator-harness';

/**
 * Spec 021 (contracts/homebox-completion.md §2, §4): the "complete" branch of the orchestrator. Explicit lists of calls
 * (never a snapshot): the creation path and its snapshot are untouched. Fixed, fictitious values only.
 */

const TAGS = [
  { id: 't-bureau', name: 'Bureau' },
  { id: 't-amazon', name: 'Amazon' },
];
const GET = `GET /entities/${ITEM_ID}`;
const PUT = `PUT /entities/${ITEM_ID}`;
const ATTACH = `POST /entities/${ITEM_ID}/attachments`;
const CREATIONS = ['POST /entities', 'POST /templates/{id}/create-item'];
/** Notes line of the order, as the service worker writes it (same text as the creation note, without the page URL). */
const noteLine = (d: ImportDraft = draft()) => orderNoteLine(d)!;

describe('orchestrator: completing an existing item (021, US1, O1 to O7)', () => {
  it('O1: doc + photo + 1 tag on an item without attachment → read, tags, PUT, two attachments; no creation', async () => {
    const { orchestrator, calls } = completionSetup({ items: [existing()], tags: TAGS });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['doc:detected-0', 'photo', 'tag:amazon'])],
        [],
      ),
    );
    expect(calls).toEqual([GET, 'GET /tags', PUT, ATTACH, ATTACH]);
    for (const c of CREATIONS) expect(calls).not.toContain(c);
    expect(p.status).toBe('success');
    expect(p.entityId).toBe(ITEM_ID);
    expect(p.steps).toMatchObject({
      create: 'done',
      update: 'done',
      tags: 'done',
      photo: 'done',
      attachments: { 'detected-0': 'done' },
    });
  });

  it('the import starts with entityId set and the creation step done, before any request', async () => {
    const { orchestrator, states } = completionSetup({ items: [existing()], tags: TAGS });
    await orchestrator.startImport(5, [completeDraft(['tag:amazon'])], []);
    expect(states[0]).toMatchObject({
      entityId: ITEM_ID,
      status: 'running',
      steps: { create: 'done', update: 'pending', tags: 'pending' },
      completion: { skipped: [], present: [] },
    });
    expect(states[0]!.steps).not.toHaveProperty('orderFields');
  });

  it('O2: the PUT body = preservingUpdate(item read, { tagIds }): name, description, location, fields, notes, sale kept', async () => {
    const item = existing();
    const { orchestrator, puts, items } = completionSetup({ items: [item], tags: TAGS });
    await orchestrator.startImport(
      5,
      [completeDraft(['doc:detected-0', 'photo', 'tag:amazon'])],
      [],
    );
    expect(puts).toHaveLength(1);
    const body = puts[0]!.body;
    expect(body).toEqual(preservingUpdate(item, { tagIds: ['t-bureau', 't-amazon'] }));
    expect(body).toMatchObject({
      name: item.name,
      description: item.description,
      parentId: 'loc-1',
      notes: item.notes,
      fields: item.fields,
      soldTo: 'Acheteur Exemple',
      soldPrice: 20,
      quantity: 2,
    });
    expect(items.get(ITEM_ID)!.tags!.map((t) => t.name)).toEqual(['Bureau', 'Amazon']);
  });

  it('O3: item with a primary photo → the photo is sent without primary', async () => {
    const item = existing({
      attachments: [{ id: 'a1', type: 'photo', primary: true, title: 'photo.jpg' }],
    });
    const { orchestrator, uploads, items } = completionSetup({ items: [item], tags: TAGS });
    await orchestrator.startImport(5, [completeDraft(['photo'])], []);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.file.type).toBe('photo');
    expect(uploads[0]!.file.primary).toBeFalsy();
    expect(items.get(ITEM_ID)!.attachments!.find((a) => a.id === 'a1')!.primary).toBe(true);
  });

  it('O4: item without a primary photo → primary=true', async () => {
    const item = existing({
      attachments: [{ id: 'a1', type: 'photo', primary: false, title: 'photo.jpg' }],
    });
    const { orchestrator, uploads } = completionSetup({ items: [item], tags: TAGS });
    await orchestrator.startImport(5, [completeDraft(['photo'])], []);
    expect(uploads[0]!.file.primary).toBe(true);
  });

  it('O5: a document of the same title already attached → no POST, present, step done', async () => {
    const item = existing({
      attachments: [{ id: 'a1', type: 'receipt', title: `facture-amazon-${NUMBER}.pdf` }],
    });
    const { orchestrator, calls } = completionSetup({ items: [item], tags: TAGS });
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['doc:detected-0'])], []));
    expect(calls).toEqual([GET]);
    expect(p.completion?.present).toEqual(['detected-0']);
    expect(p.steps.attachments['detected-0']).toBe('done');
    expect(p.status).toBe('success');
  });

  it('only the confirmed documents and photo are attached', async () => {
    const { orchestrator, calls, uploads } = completionSetup({ items: [existing()], tags: TAGS });
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['photo'])], []));
    expect(calls).toEqual([GET, ATTACH]);
    expect(uploads.map((u) => u.file.type)).toEqual(['photo']);
    expect(p.draft.documents).toEqual([]);
    expect(p.status).toBe('success');
  });

  it('O6: complete + a location, or complete + a template → BAD_MESSAGE before any request', async () => {
    const { orchestrator, calls } = completionSetup({ items: [existing()], tags: TAGS });
    const located: ImportDraft = {
      ...completeDraft(['photo']),
      location: { id: 'loc-1', path: ['Bureau'] },
    };
    expect(await orchestrator.startImport(5, [located], [])).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    const template = {
      id: 'tpl',
      name: 'T',
      fingerprint: 'a'.repeat(64),
      insured: false,
      manufacturer: '',
      modelNumber: '',
      fields: [],
    };
    expect(await orchestrator.startImport(5, [{ ...located, template }], [])).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(calls).toEqual([]);
  });

  it('O7: a batch of one creation + one completion: the created product follows the creation sequence exactly', async () => {
    const created = draft();
    const alone = completionSetup({ items: [existing()], tags: TAGS });
    await alone.orchestrator.startImport(5, [created], []);
    expect(alone.calls).toEqual([
      'POST /entities',
      'PUT /entities/created',
      'POST /entities/created/attachments',
    ]);

    const batch = completionSetup({ items: [existing()], tags: TAGS });
    const r = await batch.orchestrator.startImport(5, [created, completeDraft(['tag:amazon'])], []);
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(batch.calls).toEqual([
      'POST /entities',
      'PUT /entities/created',
      'POST /entities/created/attachments',
      GET,
      'GET /tags',
      PUT,
    ]);
    expect(batch.puts[0]!.body).toEqual(alone.puts[0]!.body);
  });

  it('O18: no log contains a value of the item or of the draft; only endpoint templates', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const item = existing({
      notes: 'Note privée',
      fields: [{ id: 'f1', name: 'Couleur', type: 'text', textValue: 'Valeur privée' }],
    });
    const { orchestrator } = completionSetup({ items: [item], tags: TAGS });
    await orchestrator.startImport(
      5,
      [
        completeDraft(
          ['doc:detected-0', 'photo', 'tag:amazon', 'purchasePrice', 'notes', 'field:orderNumber'],
          {
            orderFields: [{ role: 'orderNumber', name: 'Order number', value: NUMBER }],
          },
        ),
      ],
      [],
    );
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of [
      'Clavier sans fil',
      'Note privée',
      'Valeur privée',
      'Couleur',
      NUMBER,
      '99.99',
      'Amazon',
      ITEM_ID,
    ]) {
      expect(output).not.toContain(secret);
    }
    for (const s of spies) s.mockRestore();
  });
});

describe('orchestrator: nothing is ever overwritten, even if the item changes (021, US2, O8 to O10)', () => {
  it('O8: 404 on the read again → failed, ITEM_NOT_FOUND, no write, no creation', async () => {
    const { orchestrator, calls } = completionSetup({ items: [], tags: TAGS });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['doc:detected-0', 'photo', 'tag:amazon', 'purchasePrice'])],
        [],
      ),
    );
    expect(calls).toEqual([GET]);
    expect(p.status).toBe('failed');
    expect(p.error).toBe('ITEM_NOT_FOUND');
    expect(p.entityId).toBe(ITEM_ID);
  });

  it('O9: price filled between the preview and the send → PUT without purchasePrice; completion.skipped; success', async () => {
    const { orchestrator, puts, items } = completionSetup({
      items: [existing({ purchasePrice: 12.5 })],
      tags: TAGS,
    });
    const p = firstOf(
      await orchestrator.startImport(5, [completeDraft(['purchasePrice', 'purchaseDate'])], []),
    );
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body.purchasePrice).toBe(12.5);
    expect(puts[0]!.body.purchaseDate).toBe('2026-10-22');
    expect(p.completion?.skipped).toEqual(['purchasePrice']);
    expect(p.status).toBe('success');
    expect(items.get(ITEM_ID)!.purchasePrice).toBe(12.5);
  });

  it('O10: no applicable key and no attachment → no PUT, completion.noChange, success', async () => {
    const item = existing({
      purchasePrice: 12.5,
      notes: `Commande ${NUMBER}`,
      tags: [{ id: 't-amazon', name: 'Amazon' }],
    });
    const { orchestrator, calls } = completionSetup({ items: [item], tags: TAGS });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['purchasePrice', 'notes', 'tag:amazon'])],
        [],
      ),
    );
    expect(calls).toEqual([GET]);
    expect(p.completion).toMatchObject({ noChange: true, skipped: ['purchasePrice', 'notes'] });
    expect(p.steps).toMatchObject({ update: 'done', tags: 'done' });
    expect(p.status).toBe('success');
  });

  it('SC-002: on a fully filled item, the PUT body = preservingUpdate(read, {}) + the added tag only', async () => {
    const item = existing({
      purchasePrice: 30,
      purchaseDate: '2025-05-05',
      purchaseFrom: 'Boutique',
      warrantyExpires: '2027-05-05',
      warrantyDetails: 'Constructeur',
      notes: `Commande ${NUMBER}`,
      fields: [{ id: 'f1', name: 'Order number', type: 'text', textValue: 'autre' }],
    });
    const { orchestrator, puts } = completionSetup({ items: [item], tags: TAGS });
    const d = completeDraft(
      [
        'tag:amazon',
        'purchasePrice',
        'purchaseDate',
        'purchaseFrom',
        'warrantyExpires',
        'warrantyDetails',
        'notes',
        'field:orderNumber',
      ],
      {
        warranty: {
          origin: 'legal',
          expires: '2028-10-22',
          lifetime: false,
          details: 'Garantie légale',
          durationMonths: 24,
          edited: false,
        },
        orderFields: [{ role: 'orderNumber', name: 'Order number', value: NUMBER }],
      },
    );
    const p = firstOf(await orchestrator.startImport(5, [d], []));
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual(preservingUpdate(item, { tagIds: ['t-bureau', 't-amazon'] }));
    expect(p.completion?.skipped).toEqual([
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'warrantyDetails',
      'notes',
      'field:orderNumber',
    ]);
    expect(p.steps.orderFields).toBe('done');
  });

  it('a category not confirmed is never written, even when the target is empty', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    await orchestrator.startImport(5, [completeDraft(['notes'])], []);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toEqual(
      preservingUpdate(existing(), { notes: `Achat en magasin\n${noteLine()}` }),
    );
    expect(puts[0]!.body).not.toHaveProperty('purchaseDate');
  });

  it('a refused PUT fails the update step (UPDATE_FAILED), without a second PUT; attachments still sent', async () => {
    const { orchestrator, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
      update: [{ ok: false, error: 'UPDATE_FAILED', httpStatus: 422 }],
    });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['doc:detected-0', 'tag:amazon', 'purchasePrice'])],
        [],
      ),
    );
    expect(calls).toEqual([GET, 'GET /tags', PUT, ATTACH]);
    expect(p.status).toBe('partial');
    expect(p.error).toBe('UPDATE_FAILED');
    expect(p.steps).toMatchObject({ update: 'failed', tags: 'failed' });
  });
});

describe('orchestrator: purchase and warranty only when empty (021, US3)', () => {
  const warranty = {
    origin: 'legal' as const,
    expires: '2028-10-22',
    lifetime: false,
    details: 'Garantie légale',
    durationMonths: 24,
    edited: false,
  };

  it('no price, date nor warranty, a seller: the PUT carries price, date, expiry and details, never purchaseFrom', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    const keys = [
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'warrantyDetails',
    ] as const;
    const p = firstOf(
      await orchestrator.startImport(5, [completeDraft([...keys], { warranty })], []),
    );
    expect(puts[0]!.body).toMatchObject({
      purchasePrice: 99.99,
      purchaseDate: '2026-10-22',
      warrantyExpires: '2028-10-22',
      warrantyDetails: 'Garantie légale',
      purchaseFrom: 'Boutique',
    });
    expect(puts[0]!.body.lifetimeWarranty).toBe(false);
    expect(p.completion?.skipped).toEqual(['purchaseFrom']);
  });

  it('lifetime warranty: lifetimeWarranty true, never with a date', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    const lifetime = { ...warranty, lifetime: true, expires: null };
    await orchestrator.startImport(
      5,
      [completeDraft(['lifetimeWarranty'], { warranty: lifetime })],
      [],
    );
    expect(puts[0]!.body.lifetimeWarranty).toBe(true);
    expect(puts[0]!.body).not.toHaveProperty('warrantyExpires');
  });
});

describe('orchestrator: absent order fields and the notes line (021, US4, O11, O12)', () => {
  const orderFields = [
    { role: 'orderNumber' as const, name: 'Order number', value: NUMBER },
    { role: 'merchant' as const, name: 'Merchant', value: 'Amazon.fr' },
  ];

  it('O11: field:orderNumber confirmed → added without id, fields read sent back, read again, orderFields done', async () => {
    const item = existing();
    const { orchestrator, calls, puts } = completionSetup({ items: [item], tags: TAGS });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['field:orderNumber'], { orderFields })],
        [],
      ),
    );
    expect(calls).toEqual([GET, PUT, GET]);
    expect(puts[0]!.body.fields).toEqual([
      {
        id: 'f1',
        name: 'Merchant',
        type: 'text',
        textValue: 'Boutique',
        numberValue: 0,
        booleanValue: false,
      },
      {
        type: 'text',
        name: 'Order number',
        textValue: NUMBER,
        numberValue: 0,
        booleanValue: false,
      },
    ]);
    expect(p.steps.orderFields).toBe('done');
    expect(p.status).toBe('success');
  });

  it('a read-back that does not show the added field → ORDER_FIELDS_FAILED, partial', async () => {
    const { orchestrator } = completionSetup({
      items: [existing()],
      tags: TAGS,
      get: [null, { ok: true, value: existing() }],
    });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['field:orderNumber'], { orderFields })],
        [],
      ),
    );
    expect(p.steps.orderFields).toBe('failed');
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_FIELDS_FAILED');
  });

  it('O12: a field of the same name appeared between the preview and the send → not added, skipped', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    const p = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft(['field:merchant', 'notes'], { orderFields })],
        [],
      ),
    );
    expect(puts[0]!.body.fields).toEqual(existing().fields);
    expect(p.completion?.skipped).toEqual(['field:merchant']);
    expect(p.steps.orderFields).toBe('done');
  });

  it('notes: the line is added at the end, the notes read are an exact prefix', async () => {
    const { orchestrator, puts } = completionSetup({
      items: [existing({ notes: 'Ligne 1\nLigne 2' })],
      tags: TAGS,
    });
    await orchestrator.startImport(5, [completeDraft(['notes'])], []);
    expect(puts[0]!.body.notes).toBe(`Ligne 1\nLigne 2\n${noteLine()}`);
    expect(noteLine()).toContain(NUMBER);
  });

  it('notes already containing the order number → nothing written', async () => {
    const { orchestrator, puts } = completionSetup({
      items: [existing({ notes: `Vu : ${NUMBER}` })],
      tags: TAGS,
    });
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['notes'])], []));
    expect(puts).toEqual([]);
    expect(p.completion?.skipped).toEqual(['notes']);
  });

  it('option off: only the notes line; no custom field is written', async () => {
    const { orchestrator, puts } = completionSetup({
      items: [existing({ notes: '' })],
      tags: TAGS,
    });
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['notes'])], []));
    expect(puts[0]!.body.notes).toBe(noteLine());
    expect(puts[0]!.body.fields).toEqual(existing().fields);
    expect(p.steps).not.toHaveProperty('orderFields');
  });
});

describe('orchestrator: quantity on explicit request (021, US5, O13)', () => {
  it('O13: quantity checked (read 2, N 1) → base 2 / target 3 persisted before the PUT; PUT quantity 3', async () => {
    const { orchestrator, puts, client, states } = completionSetup({
      items: [existing()],
      tags: TAGS,
    });
    let persistedBeforePut: unknown;
    client.updateEntity.mockImplementationOnce(async (id, body) => {
      persistedBeforePut = states.at(-1)?.completion;
      return { ok: true, value: { ...existing(), id, quantity: body.quantity } };
    });
    await orchestrator.startImport(
      5,
      [completeDraft([], { quantity: 1 }, { quantityIncrease: 1 })],
      [],
    );
    expect(persistedBeforePut).toMatchObject({ quantityBase: 2, quantityTarget: 3 });
    expect(client.updateEntity).toHaveBeenCalledTimes(1);
    expect(puts).toHaveLength(0);
    expect((client.updateEntity.mock.calls[0]![1] as { quantity: number }).quantity).toBe(3);
  });

  it('without the box, the quantity read is sent back unchanged', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    await orchestrator.startImport(5, [completeDraft(['notes'], { quantity: 4 })], []);
    expect(puts[0]!.body.quantity).toBe(2);
  });
});

describe('orchestrator: similar items and mixed batches (021, US6)', () => {
  it('a mixed batch: rememberLocation only when at least one product was created', async () => {
    const onlyCompleted = completionSetup({ items: [existing()], tags: TAGS });
    await onlyCompleted.orchestrator.startImport(5, [completeDraft(['notes'])], [], 'loc-9');
    expect(onlyCompleted.rememberLocation).not.toHaveBeenCalled();

    const mixed = completionSetup({ items: [existing()], tags: TAGS });
    await mixed.orchestrator.startImport(
      5,
      [draft({ location: { id: 'loc-9', path: ['Cave'] } }), completeDraft(['notes'])],
      [],
      'loc-9',
    );
    expect(mixed.rememberLocation).toHaveBeenCalledWith('loc-9');
  });

  it('two products completing the same item: each one reads it again before writing', async () => {
    const { orchestrator, puts } = completionSetup({ items: [existing()], tags: TAGS });
    const r = await orchestrator.startImport(
      5,
      [completeDraft(['purchasePrice', 'notes']), completeDraft(['purchasePrice', 'notes'])],
      [],
    );
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(puts).toHaveLength(1);
    expect(r.ok && r.value[1]!.completion).toMatchObject({
      noChange: true,
      skipped: [],
    });
  });
});
