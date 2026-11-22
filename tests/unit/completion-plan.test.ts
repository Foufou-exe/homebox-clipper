import type { EntityField, EntityOut } from '@/background/homebox/types';
import {
  attachmentName,
  attachmentTitle,
  completionPatch,
  hasWarranty,
  isEmptyPrice,
  isEmptyValue,
  orderLine,
  planCompletion,
  quantityPlan,
} from '@/background/import/completion';
import type {
  CompletionChoice,
  CompletionKey,
  DocumentRef,
  ImportDraft,
  WarrantyDraft,
} from '@/shared/types';

/**
 * Spec 021 (contracts/completion-plan.md §2, P1 to P24): the pure module that computes what completing an existing
 * HomeBox item would add, and the patch of the PUT. Fixed, fictitious values only.
 */

const NUMBER = '999-0000000-0000001';
const NOTE = `Commande Amazon.fr : ${NUMBER}`;

const invoice: DocumentRef = {
  id: 'detected-0',
  origin: 'detected',
  kind: 'invoice',
  label: `Facture ${NUMBER}.pdf`,
  url: 'https://www.amazon.fr/documents/download/x/invoice.pdf',
};
const manual: DocumentRef = { id: 'manual-1', origin: 'manual', kind: 'manual', label: 'notice' };

const warranty = (over: Partial<WarrantyDraft> = {}): WarrantyDraft => ({
  origin: 'legal',
  expires: '2028-01-15',
  lifetime: false,
  details: 'Garantie légale de conformité',
  durationMonths: 24,
  edited: false,
  ...over,
});

function draft(over: Partial<ImportDraft> = {}): ImportDraft {
  return {
    name: 'Clavier sans fil Exemple Pro',
    description: 'Acheté sur Amazon.fr',
    purchasePrice: 49.99,
    currency: 'EUR',
    purchaseDate: '2026-01-15',
    purchaseFrom: 'Amazon.fr',
    orderNumber: NUMBER,
    quantity: 1,
    pageUrl: 'https://www.amazon.fr/your-orders/order-details',
    documents: [invoice],
    photo: {
      url: 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg',
      merchantId: 'amazon.fr',
      include: true,
    },
    location: null,
    warranty: warranty(),
    tags: [{ name: 'Amazon' }],
    orderFields: [
      { role: 'orderNumber', name: 'Order number', value: NUMBER },
      { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
    ],
    ...over,
  };
}

const empty: EntityOut = { id: 'item-1', name: 'Clavier sans fil Exemple Pro', quantity: 2 };

const filledItem: EntityOut = {
  id: 'item-1',
  name: 'Clavier',
  quantity: 2,
  purchasePrice: 10,
  purchaseDate: '2025-12-01',
  purchaseFrom: 'Boutique',
  warrantyExpires: '2027-12-01',
  warrantyDetails: 'Constructeur',
  notes: `Déjà importé ${NUMBER}`,
  tags: [{ id: 't-amazon', name: 'Amazon' }],
  fields: [
    { id: 'f1', name: 'Order number', type: 'text', textValue: NUMBER },
    { id: 'f2', name: 'Merchant', type: 'text', textValue: 'Boutique' },
  ],
  attachments: [{ id: 'a1', type: 'receipt', title: `Facture ${NUMBER}.pdf` }],
};

const keysOf = (plan: { changes: { key: CompletionKey }[] }) => plan.changes.map((c) => c.key);
const choice = (keys: CompletionKey[], over: Partial<CompletionChoice> = {}): CompletionChoice => ({
  entityId: 'item-1',
  itemName: 'Clavier',
  keys,
  ...over,
});

describe('empty values (021, P1, P2)', () => {
  it('P1: isEmptyValue', () => {
    for (const v of [undefined, null, '', '0001-01-01', '0001-01-01T00:00:00Z'])
      expect(isEmptyValue(v), String(v)).toBe(true);
    for (const v of ['2026-01-15', 'x']) expect(isEmptyValue(v), v).toBe(false);
  });

  it('P2: isEmptyPrice', () => {
    for (const v of [undefined, null, 0]) expect(isEmptyPrice(v)).toBe(true);
    for (const v of [0.01, 49.99]) expect(isEmptyPrice(v)).toBe(false);
  });

  it('hasWarranty: lifetime or a non-empty expiry', () => {
    expect(hasWarranty({ id: 'x', name: 'x' })).toBe(false);
    expect(hasWarranty({ id: 'x', name: 'x', lifetimeWarranty: false, warrantyExpires: '' })).toBe(
      false,
    );
    expect(hasWarranty({ id: 'x', name: 'x', warrantyExpires: '0001-01-01T00:00:00Z' })).toBe(
      false,
    );
    expect(hasWarranty({ id: 'x', name: 'x', lifetimeWarranty: true })).toBe(true);
    expect(hasWarranty({ id: 'x', name: 'x', warrantyExpires: '2027-01-01' })).toBe(true);
  });
});

describe('purchase and warranty (021, P3 to P6)', () => {
  it('P3: empty item, full draft → every purchase key proposed, nothing filled', () => {
    const plan = planCompletion(empty, draft(), NOTE);
    expect(plan.changes.filter((c) => c.category === 'purchase').map((c) => c.key)).toEqual([
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'warrantyDetails',
    ]);
    expect(plan.filled).toEqual([]);
    expect(plan.quantity).toBe(2);
  });

  it('P4: fully filled item → no purchase key; all of them in filled', () => {
    const plan = planCompletion(filledItem, draft(), NOTE);
    expect(plan.changes.filter((c) => c.category === 'purchase')).toEqual([]);
    expect(plan.filled).toEqual(
      expect.arrayContaining([
        'purchasePrice',
        'purchaseDate',
        'purchaseFrom',
        'warrantyExpires',
        'warrantyDetails',
      ]),
    );
  });

  it('a zero price or a zero date in HomeBox is empty', () => {
    const plan = planCompletion(
      { ...empty, purchasePrice: 0, purchaseDate: '0001-01-01T00:00:00Z' },
      draft(),
      NOTE,
    );
    expect(keysOf(plan)).toEqual(expect.arrayContaining(['purchasePrice', 'purchaseDate']));
  });

  it('a draft without price, date or seller proposes nothing for them and reports nothing', () => {
    const plan = planCompletion(
      empty,
      draft({ purchasePrice: null, purchaseDate: null, purchaseFrom: '  ', warranty: null }),
      NOTE,
    );
    expect(plan.changes.filter((c) => c.category === 'purchase')).toEqual([]);
    expect(plan.filled).toEqual([]);
  });

  it('P5: lifetime warranty on the item, draft with a date → neither expiry nor lifetime', () => {
    const plan = planCompletion({ ...empty, lifetimeWarranty: true }, draft(), NOTE);
    expect(keysOf(plan)).not.toContain('warrantyExpires');
    expect(keysOf(plan)).not.toContain('lifetimeWarranty');
    expect(plan.filled).toContain('warrantyExpires');
  });

  it('P6: expiry filled on the item, lifetime draft → neither lifetime nor expiry; empty details proposed', () => {
    const plan = planCompletion(
      { ...empty, warrantyExpires: '2027-01-01' },
      draft({ warranty: warranty({ lifetime: true, expires: null }) }),
      NOTE,
    );
    expect(keysOf(plan)).not.toContain('lifetimeWarranty');
    expect(keysOf(plan)).not.toContain('warrantyExpires');
    expect(keysOf(plan)).toContain('warrantyDetails');
    expect(plan.filled).toContain('lifetimeWarranty');
  });

  it('no warranty on the item and a lifetime draft → lifetimeWarranty, never a date', () => {
    const plan = planCompletion(
      empty,
      draft({ warranty: warranty({ lifetime: true, expires: null }) }),
      NOTE,
    );
    expect(keysOf(plan)).toContain('lifetimeWarranty');
    expect(keysOf(plan)).not.toContain('warrantyExpires');
  });
});

describe('order fields and notes (021, P7 to P11)', () => {
  const withField = (f: EntityField): EntityOut => ({ ...empty, fields: [f] });

  it('P7: a "Merchant" field (number type, edge spaces) → field:merchant filled', () => {
    const plan = planCompletion(
      withField({ id: 'f1', name: '  Merchant ', type: 'number', numberValue: 3 }),
      draft(),
      NOTE,
    );
    expect(plan.filled).toContain('field:merchant');
    expect(keysOf(plan)).not.toContain('field:merchant');
    expect(keysOf(plan)).toContain('field:orderNumber');
  });

  it('P8: a "merchant" field (other case) → field:merchant proposed (exact case, rule of 019)', () => {
    const plan = planCompletion(
      withField({ id: 'f1', name: 'merchant', type: 'text', textValue: 'x' }),
      draft(),
      NOTE,
    );
    expect(keysOf(plan)).toContain('field:merchant');
  });

  it('without order fields (option off) → only the notes line in the order category', () => {
    const plan = planCompletion(empty, draft({ orderFields: undefined }), NOTE);
    expect(plan.changes.filter((c) => c.category === 'order').map((c) => c.key)).toEqual(['notes']);
  });

  it('P9: notes containing the order number → notes filled', () => {
    const plan = planCompletion({ ...empty, notes: `Commande ${NUMBER} reçue` }, draft(), NOTE);
    expect(plan.filled).toContain('notes');
    expect(keysOf(plan)).not.toContain('notes');
  });

  it('P10: empty, "" or absent notes → notes proposed; patch notes = the line alone', () => {
    for (const notes of [undefined, '']) {
      const e = { ...empty, notes };
      expect(keysOf(planCompletion(e, draft(), NOTE))).toContain('notes');
      expect(completionPatch(e, draft(), choice(['notes']), NOTE).patch).toEqual({ notes: NOTE });
    }
  });

  it('P11: notes "Achat en magasin" → patch notes = notes + newline + line (prefix unchanged)', () => {
    const e = { ...empty, notes: 'Achat en magasin' };
    expect(completionPatch(e, draft(), choice(['notes']), NOTE).patch.notes).toBe(
      `Achat en magasin\n${NOTE}`,
    );
    expect(orderLine(e, draft(), NOTE)).toEqual({ add: true, notes: `Achat en magasin\n${NOTE}` });
  });

  it('no order number → no notes line, nothing reported', () => {
    const plan = planCompletion(empty, draft({ orderNumber: null, orderFields: undefined }), NOTE);
    expect(keysOf(plan)).not.toContain('notes');
    expect(plan.filled).not.toContain('notes');
  });
});

describe('tags and attachments (021, P12 to P16)', () => {
  it('P12: one checked tag present by id, one by name (other case), one absent → only the absent one', () => {
    const plan = planCompletion(
      {
        ...empty,
        tags: [
          { id: 't1', name: 'Bureau' },
          { id: 't2', name: 'INFORMATIQUE' },
        ],
      },
      draft({ tags: [{ name: 'Office', id: 't1' }, { name: 'Informatique' }, { name: 'Amazon' }] }),
      NOTE,
    );
    expect(plan.changes.filter((c) => c.category === 'tags').map((c) => c.key)).toEqual([
      'tag:amazon',
    ]);
    expect(plan.filled).toEqual(expect.arrayContaining(['tag:office', 'tag:informatique']));
  });

  it('P13: a document of the same (normalised) title already attached → doc filled', () => {
    const plan = planCompletion(
      { ...empty, attachments: [{ id: 'a1', type: 'attachment', title: 'notice.pdf' }] },
      draft({ documents: [invoice, manual] }),
      NOTE,
    );
    expect(plan.filled).toContain('doc:manual-1');
    expect(keysOf(plan)).toContain('doc:detected-0');
  });

  it('P14: photo, item with a primary photo → photo proposed, primary false', () => {
    const plan = planCompletion(
      { ...empty, attachments: [{ id: 'a1', type: 'photo', primary: true }] },
      draft(),
      NOTE,
    );
    expect(plan.changes.find((c) => c.key === 'photo')).toEqual({
      key: 'photo',
      category: 'attachments',
      primary: false,
    });
  });

  it('P15: photo, item with non-primary photos or without photo → primary true', () => {
    for (const attachments of [
      [{ id: 'a1', type: 'photo', primary: false }],
      [{ id: 'a2', type: 'receipt', primary: true }],
      [],
    ]) {
      const plan = planCompletion({ ...empty, attachments }, draft(), NOTE);
      expect(plan.changes.find((c) => c.key === 'photo')?.primary).toBe(true);
    }
  });

  it('P16: photo unchecked in the summary → no photo', () => {
    const photo = {
      url: 'https://m.media-amazon.com/images/I/x.jpg',
      merchantId: 'amazon.fr' as const,
      include: false,
    };
    expect(keysOf(planCompletion(empty, draft({ photo }), NOTE))).not.toContain('photo');
    expect(keysOf(planCompletion(empty, draft({ photo: null }), NOTE))).not.toContain('photo');
  });

  it('order of the changes: attachments, tags, purchase, order', () => {
    const plan = planCompletion(empty, draft(), NOTE);
    const order = plan.changes.map((c) => c.category);
    const firsts = ['attachments', 'tags', 'purchase', 'order'].map((c) =>
      order.indexOf(c as never),
    );
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    expect(keysOf(plan)).toEqual([
      'doc:detected-0',
      'photo',
      'tag:amazon',
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'warrantyDetails',
      'field:orderNumber',
      'field:merchant',
      'notes',
    ]);
  });
});

describe('completionPatch (021, P17 to P21, P24)', () => {
  it('P17: confirmed keys ⊂ plan → patch with these keys only, nothing skipped', () => {
    const res = completionPatch(
      empty,
      draft(),
      choice(['purchasePrice', 'purchaseDate', 'warrantyExpires']),
      NOTE,
    );
    expect(res.patch).toEqual({
      purchasePrice: 49.99,
      purchaseDate: '2026-01-15',
      warrantyExpires: '2028-01-15',
    });
    expect(res.applied).toEqual(['purchasePrice', 'purchaseDate', 'warrantyExpires']);
    expect(res.skipped).toEqual([]);
  });

  it('P18: price confirmed but filled on the read item → no purchasePrice, skipped', () => {
    const res = completionPatch(
      { ...empty, purchasePrice: 12 },
      draft(),
      choice(['purchasePrice', 'purchaseFrom']),
      NOTE,
    );
    expect(res.patch).toEqual({ purchaseFrom: 'Amazon.fr' });
    expect(res.skipped).toEqual(['purchasePrice']);
  });

  it('P19: an applicable key that was not confirmed is absent from the patch', () => {
    const res = completionPatch(empty, draft(), choice(['notes']), NOTE);
    expect(Object.keys(res.patch)).toEqual(['notes']);
  });

  it('tags, documents and photo are handled by their own steps: never in the patch, never skipped here', () => {
    const res = completionPatch(
      filledItem,
      draft(),
      choice(['tag:amazon', 'doc:detected-0', 'photo']),
      NOTE,
    );
    expect(res.patch).toEqual({});
    expect(res.skipped).toEqual([]);
  });

  it('lifetime warranty and details', () => {
    const d = draft({
      warranty: warranty({ lifetime: true, expires: null, details: '  À vie  ' }),
    });
    expect(
      completionPatch(empty, d, choice(['lifetimeWarranty', 'warrantyDetails']), NOTE).patch,
    ).toEqual({
      lifetimeWarranty: true,
      warrantyDetails: 'À vie',
    });
  });

  it('P20: never name, description, parentId, locationId, entityTypeId nor templateId (50 fixed combinations)', () => {
    const all: CompletionKey[] = [
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'lifetimeWarranty',
      'warrantyDetails',
      'notes',
      'field:orderNumber',
      'field:merchant',
      'tag:amazon',
      'doc:detected-0',
      'photo',
    ];
    const items: EntityOut[] = [
      empty,
      filledItem,
      { ...empty, notes: 'x', parent: { id: 'loc' }, locationId: 'loc' },
    ];
    for (let i = 0; i < 50; i++) {
      const keys = all.filter((_, j) => ((i * 7 + 3) >> j) % 2 === 1 || (i + j) % 5 === 0);
      const res = completionPatch(
        items[i % items.length]!,
        draft(),
        choice(keys),
        NOTE,
        i % 3 === 0 ? i : undefined,
      );
      for (const forbidden of [
        'name',
        'description',
        'parentId',
        'locationId',
        'entityTypeId',
        'templateId',
        'id',
        'tagIds',
      ]) {
        expect(res.patch, `${i} ${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  it('P21: fields sends every read field back as is, then the added ones without id', () => {
    const read: EntityField[] = [
      {
        id: 'f1',
        name: 'Couleur',
        type: 'text',
        textValue: 'Noir',
        numberValue: 0,
        booleanValue: false,
      },
      {
        id: 'f2',
        name: 'Pieces',
        type: 'number',
        textValue: '',
        numberValue: 3,
        booleanValue: false,
      },
      { id: 'f3', name: 'Merchant', type: 'boolean', booleanValue: true },
    ];
    const res = completionPatch(
      { ...empty, fields: read },
      draft(),
      choice(['field:orderNumber', 'field:merchant']),
      NOTE,
    );
    expect(res.patch.fields).toEqual([
      {
        id: 'f1',
        name: 'Couleur',
        type: 'text',
        textValue: 'Noir',
        numberValue: 0,
        booleanValue: false,
      },
      {
        id: 'f2',
        name: 'Pieces',
        type: 'number',
        textValue: '',
        numberValue: 3,
        booleanValue: false,
      },
      {
        id: 'f3',
        name: 'Merchant',
        type: 'boolean',
        textValue: undefined,
        numberValue: undefined,
        booleanValue: true,
      },
      {
        type: 'text',
        name: 'Order number',
        textValue: NUMBER,
        numberValue: 0,
        booleanValue: false,
      },
    ]);
    expect(res.skipped).toEqual(['field:merchant']);
    expect(res.fields).toEqual([{ role: 'orderNumber', name: 'Order number', value: NUMBER }]);
  });

  it('quantity: the value to send is added to the patch', () => {
    expect(completionPatch(empty, draft(), choice([]), NOTE, 3).patch).toEqual({ quantity: 3 });
  });

  it('P24: nothing to apply → empty patch', () => {
    const res = completionPatch(
      filledItem,
      draft(),
      choice(['purchasePrice', 'notes', 'field:orderNumber']),
      NOTE,
    );
    expect(res.patch).toEqual({});
    expect(res.applied).toEqual([]);
    expect(res.skipped).toEqual(['purchasePrice', 'notes']);
    // The field already holds the value of the draft: written earlier, not "filled meanwhile".
    expect(res.already).toEqual(['field:orderNumber']);
  });

  it('a value equal to the draft one (lost PUT answer) counts as already written, never as skipped', () => {
    const written: EntityOut = {
      ...empty,
      purchasePrice: 49.99,
      purchaseDate: '2026-01-15T00:00:00Z',
      purchaseFrom: 'Amazon.fr',
      warrantyExpires: '2028-01-15',
      warrantyDetails: 'Garantie légale de conformité',
      notes: `Achat en magasin\n${NOTE}`,
      fields: [{ id: 'f9', name: 'Order number', type: 'text', textValue: NUMBER }],
    };
    const keys: CompletionKey[] = [
      'purchasePrice',
      'purchaseDate',
      'purchaseFrom',
      'warrantyExpires',
      'warrantyDetails',
      'notes',
      'field:orderNumber',
    ];
    const res = completionPatch(written, draft(), choice(keys), NOTE);
    expect(res.patch).toEqual({});
    expect(res.skipped).toEqual([]);
    expect(res.already).toEqual(keys);
  });

  it('a different value stays skipped (filled meanwhile by someone else)', () => {
    const other: EntityOut = { ...empty, purchasePrice: 12, notes: `Autre ${NUMBER}` };
    const res = completionPatch(other, draft(), choice(['purchasePrice', 'notes']), NOTE);
    expect(res.skipped).toEqual(['purchasePrice', 'notes']);
    expect(res.already).toEqual([]);
  });
});

describe('quantityPlan (021, P22)', () => {
  it('no state → base = read, target = read + N, sent', () => {
    expect(quantityPlan(2, 1)).toEqual({ base: 2, target: 3, send: 3, skipped: false });
  });

  it('read = base → the target is sent', () => {
    expect(quantityPlan(2, 1, { quantityBase: 2, quantityTarget: 3 })).toEqual({
      base: 2,
      target: 3,
      send: 3,
      skipped: false,
    });
  });

  it('read = target → already applied: nothing sent, not skipped', () => {
    expect(quantityPlan(3, 1, { quantityBase: 2, quantityTarget: 3 })).toEqual({
      base: 2,
      target: 3,
      skipped: false,
    });
  });

  it('other value → nothing sent, skipped', () => {
    expect(quantityPlan(5, 1, { quantityBase: 2, quantityTarget: 3 })).toEqual({
      base: 2,
      target: 3,
      skipped: true,
    });
  });

  it('non-integer quantity: N added as is', () => {
    expect(quantityPlan(1.5, 2).send).toBe(3.5);
  });
});

describe('attachment titles (021, P23)', () => {
  it('P23: same normalisation as HomeBox sanitizeAttachmentName', () => {
    expect(attachmentTitle('a/b.pdf')).toBe('b.pdf');
    expect(attachmentTitle('..x.pdf')).toBe('x.pdf');
    expect(attachmentTitle('a\\b.pdf')).toBe('ab.pdf');
    expect(attachmentTitle('Facture 999-0000000-0000001.pdf')).toBe(
      'Facture 999-0000000-0000001.pdf',
    );
  });

  it('attachmentName (moved from the orchestrator, unchanged): ".pdf" added when missing', () => {
    expect(attachmentName(invoice)).toBe(`Facture ${NUMBER}.pdf`);
    expect(attachmentName(manual)).toBe('notice.pdf');
  });
});
