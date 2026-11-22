import { emptyLineTemplate, fieldInputFor, type LineTemplate } from '@/ui/popup/drafts';
import {
  initialOrderFields,
  mergedTemplateNames,
  orderFieldRows,
  orderFieldsBlock,
  orderFieldsFor,
  type LineOrderFields,
} from '@/ui/popup/order-fields';
import type { OrderFieldSettings } from '@/shared/order-fields';
import type { ImportDraft, TemplateFieldKind } from '@/shared/types';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

const fr = loadCatalog('fr');
/** Order fields of the summary, pure functions (spec 019, Q-U1, data-model §6). Fictitious values only. */
const NUMBER = '000-0000000-0000000';
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const SETTINGS: OrderFieldSettings = {
  enabled: true,
  names: { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' },
};
const orderDraft = (over: Partial<ImportDraft> = {}) =>
  draft({ orderNumber: NUMBER, pageUrl: ORDER_URL, ...over });
const values = (merchant = 'Amazon.fr', orderUrl = ORDER_URL, edited = false): LineOrderFields => ({
  merchant: { value: merchant, edited },
  orderUrl: { value: orderUrl, edited },
});
const rowsOf = (d: ImportDraft, v: LineOrderFields, s = SETTINGS) =>
  orderFieldRows(s, d, v, emptyLineTemplate());

describe('initialOrderFields (FR-011)', () => {
  it('Amazon.fr page: merchant of the notes (catalog), URL of the page; nothing edited', () => {
    expect(initialOrderFields(orderDraft())).toEqual(values());
  });

  it('unknown store: empty merchant', () => {
    expect(
      initialOrderFields(orderDraft({ pageUrl: 'https://boutique.example.net/commande' })).merchant,
    ).toEqual({ value: '', edited: false });
  });

  it('manual entry (no page): empty URL and merchant', () => {
    expect(initialOrderFields(orderDraft({ pageUrl: null }))).toEqual(values('', ''));
  });
});

describe('orderFieldRows without template', () => {
  it('three rows in the order number, merchant, URL, with the names of the settings', () => {
    const custom: OrderFieldSettings = {
      enabled: true,
      names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
    };
    expect(rowsOf(orderDraft(), values(), custom)).toEqual([
      { role: 'orderNumber', name: 'N° commande', value: NUMBER, state: 'create', error: null },
      { role: 'merchant', name: 'Boutique', value: 'Amazon.fr', state: 'create', error: null },
      { role: 'orderUrl', name: 'Lien', value: ORDER_URL, state: 'create', error: null },
    ]);
  });

  it('the number follows the draft (single entry); empty values (spaces included) are « empty »', () => {
    const rows = rowsOf(orderDraft({ orderNumber: null }), values('   ', ''));
    expect(rows.map((r) => [r.value, r.state])).toEqual([
      ['', 'empty'],
      ['   ', 'empty'],
      ['', 'empty'],
    ]);
  });

  it('merchant and URL: the edited value when edited, else the initial value', () => {
    expect(
      rowsOf(orderDraft(), values('Boutique Exemple', 'https://x.example', true)).map(
        (r) => r.value,
      ),
    ).toEqual([NUMBER, 'Boutique Exemple', 'https://x.example']);
  });

  it('errors: too long (bytes), invalid URL; an empty URL has no error', () => {
    const long = 'é'.repeat(251);
    expect(rowsOf(orderDraft(), values(long, 'ftp://x.example', true)).map((r) => r.error)).toEqual(
      [null, 'tooLong', 'invalidUrl'],
    );
    expect(
      rowsOf(orderDraft({ orderNumber: long }), values('', '', true)).map((r) => r.error),
    ).toEqual(['tooLong', null, null]);
  });
});

describe('orderFieldsBlock, orderFieldsFor, mergedTemplateNames', () => {
  it('block: a « create » row in error blocks; an « empty » row never does', () => {
    expect(
      orderFieldsBlock(rowsOf(orderDraft(), values('Amazon.fr', 'ftp://x.example', true))),
    ).toBe(true);
    expect(orderFieldsBlock(rowsOf(orderDraft(), values()))).toBe(false);
    expect(orderFieldsBlock(rowsOf(orderDraft({ orderNumber: null }), values('', '', true)))).toBe(
      false,
    );
  });

  it('for: the names of the settings and trimmed values; the number is exactly draft.orderNumber (FR-010)', () => {
    expect(
      orderFieldsFor(rowsOf(orderDraft(), values('  Amazon.fr ', ` ${ORDER_URL} `, true))),
    ).toEqual([
      { role: 'orderNumber', name: 'Order number', value: NUMBER },
      { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
      { role: 'orderUrl', name: 'Order URL', value: ORDER_URL },
    ]);
  });

  it('for: only the « create » rows without error', () => {
    expect(orderFieldsFor(rowsOf(orderDraft(), values('', 'ftp://x.example', true)))).toEqual([
      { role: 'orderNumber', name: 'Order number', value: NUMBER },
    ]);
  });

  it('for: no row to create → null (no key at all)', () => {
    expect(
      orderFieldsFor(rowsOf(orderDraft({ orderNumber: null }), values('', '', true))),
    ).toBeNull();
  });

  it('mergedTemplateNames: [] without template', () => {
    expect(mergedTemplateNames(rowsOf(orderDraft(), values()))).toEqual([]);
  });
});

describe('orderFieldRows with a template: merge and conflict (US4, research D7)', () => {
  const view = (name: string, kind: TemplateFieldKind = 'text', textValue = '') => ({
    type: kind === 'unknown' ? 'color' : kind,
    kind,
    name,
    textValue,
    numberValue: 0,
    booleanValue: false,
  });
  const tplWith = (...fields: ReturnType<typeof view>[]): LineTemplate => ({
    ...emptyLineTemplate(),
    id: 'tpl-1',
    state: 'ready',
    detail: {
      id: 'tpl-1',
      name: 'Livre',
      fingerprint: 'a'.repeat(64),
      description: '',
      quantity: null,
      insured: false,
      manufacturer: '',
      modelNumber: '',
      lifetimeWarranty: false,
      warrantyDetails: '',
      locationId: null,
      tags: [],
      fields,
    },
    values: {
      manufacturer: '',
      modelNumber: '',
      insured: false,
      fields: fields.map(fieldInputFor),
    },
  });
  const rowsWith = (template: LineTemplate, d = orderDraft(), v = values()) =>
    orderFieldRows(SETTINGS, d, v, template);

  it('one text field named exactly « Order number » (edge spaces ignored) → merged, value of the order', () => {
    const rows = rowsWith(tplWith(view('Order number '), view('Auteur')));
    expect(rows[0]).toEqual({
      role: 'orderNumber',
      name: 'Order number',
      value: NUMBER,
      state: 'merged',
      error: null,
      templateFieldName: 'Order number ',
    });
    expect(mergedTemplateNames(rows)).toEqual(['Order number']);
    expect(orderFieldsFor(rows)![0]).toEqual({
      role: 'orderNumber',
      name: 'Order number',
      value: NUMBER,
    });
  });

  it('empty number + template field of the same name → empty, no merge (P1)', () => {
    const rows = rowsWith(
      tplWith(view('Order number', 'text', 'ABC')),
      orderDraft({ orderNumber: null }),
    );
    expect(rows[0]!.state).toBe('empty');
    expect(rows[0]!.value).toBe('');
    expect(mergedTemplateNames(rows)).toEqual([]);
  });

  it('merged merchant: entry edited > value of the order > text value of the template', () => {
    const tpl = tplWith(view('Merchant', 'text', 'Éditions Exemple'));
    expect(rowsWith(tpl, orderDraft(), values('Amazon.fr'))[1]!.value).toBe('Amazon.fr');
    expect(rowsWith(tpl, orderDraft({ pageUrl: null }), values('', ''))[1]!).toMatchObject({
      value: 'Éditions Exemple',
      state: 'merged',
    });
    expect(rowsWith(tpl, orderDraft(), values('Saisie', ORDER_URL, true))[1]!.value).toBe('Saisie');
  });

  it.each(['number', 'boolean', 'time', 'unknown'] as const)(
    'template field of type %s → conflict, nothing sent for this role',
    (kind) => {
      const rows = rowsWith(tplWith(view('Order number', kind)));
      expect(rows[0]!.state).toBe('conflict');
      expect(rows[0]!.templateType).toBe(fr[`orderFields.type.${kind}`]);
      expect(orderFieldsFor(rows)!.map((f) => f.role)).toEqual(['merchant', 'orderUrl']);
      expect(mergedTemplateNames(rows)).toEqual([]);
      expect(orderFieldsBlock(rows)).toBe(false);
    },
  );

  it('two text fields of this name → conflict (P3)', () => {
    const rows = rowsWith(tplWith(view('Merchant'), view('Merchant ')));
    expect(rows[1]!.state).toBe('conflict');
    expect(orderFieldsFor(rows)!.map((f) => f.role)).toEqual(['orderNumber', 'orderUrl']);
  });

  it('different case (« order number ») → no merge (HomeBox distinguishes the names)', () => {
    const rows = rowsWith(tplWith(view('order number')));
    expect(rows[0]!.state).toBe('create');
    expect(mergedTemplateNames(rows)).toEqual([]);
  });

  it('template without a field of the same name → create; template not ready → ignored', () => {
    expect(rowsWith(tplWith(view('Auteur'))).map((r) => r.state)).toEqual([
      'create',
      'create',
      'create',
    ]);
    expect(
      rowsWith({ ...tplWith(view('Order number')), state: 'loading' }).map((r) => r.state),
    ).toEqual(['create', 'create', 'create']);
  });

  it('changing the template recomputes the rows without touching LineOrderFields (FR-018)', () => {
    const v = values('Saisie', ORDER_URL, true);
    const copy = JSON.parse(JSON.stringify(v)) as LineOrderFields;
    rowsWith(tplWith(view('Merchant')), orderDraft(), v);
    const after = rowsWith(emptyLineTemplate(), orderDraft(), v);
    expect(after[1]).toMatchObject({ value: 'Saisie', state: 'create' });
    expect(v).toEqual(copy);
  });
});
