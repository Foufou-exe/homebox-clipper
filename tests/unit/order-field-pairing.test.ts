import type { EntityField } from '@/background/homebox/types';
import {
  applyOrderFields,
  currentFields,
  orderFieldsMatch,
} from '@/background/import/order-fields';
import type { OrderFieldValue } from '@/shared/types';

/** Pure pairing of the order fields on the service worker side (spec 019, Q-U1, data-model §7). Fictitious values. */
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const ORDER: OrderFieldValue[] = [
  { role: 'orderNumber', name: 'Order number', value: '000-0000000-0000000' },
  { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
  { role: 'orderUrl', name: 'Order URL', value: ORDER_URL },
];
const text = (name: string, textValue: string, id?: string): EntityField => ({
  ...(id === undefined ? {} : { id }),
  type: 'text',
  name,
  textValue,
  numberValue: 0,
  booleanValue: false,
});
const COULEUR = text('Couleur', 'Rouge', 'f1');

describe('applyOrderFields', () => {
  it('empty base: the three fields are created, without id, in the exact sent shape', () => {
    expect(applyOrderFields([], ORDER)).toEqual([
      {
        type: 'text',
        name: 'Order number',
        textValue: '000-0000000-0000000',
        numberValue: 0,
        booleanValue: false,
      },
      {
        type: 'text',
        name: 'Merchant',
        textValue: 'Amazon.fr',
        numberValue: 0,
        booleanValue: false,
      },
      {
        type: 'text',
        name: 'Order URL',
        textValue: ORDER_URL,
        numberValue: 0,
        booleanValue: false,
      },
    ]);
    expect(applyOrderFields([], ORDER).every((f) => !('id' in f))).toBe(true);
  });

  it('a text field of the same name is replaced in place (same id, same position, order value)', () => {
    const base = [COULEUR, text('Order number', '', 'f2')];
    expect(applyOrderFields(base, [ORDER[0]!])).toEqual([
      COULEUR,
      text('Order number', '000-0000000-0000000', 'f2'),
    ]);
  });

  it('a base name with edge spaces is paired; the confirmed name is sent', () => {
    expect(applyOrderFields([text('Order number ', 'x', 'f2')], [ORDER[0]!])).toEqual([
      text('Order number', '000-0000000-0000000', 'f2'),
    ]);
  });

  it('a number field of the same name is not touched; the order field is added', () => {
    const num: EntityField = {
      id: 'f3',
      type: 'number',
      name: 'Order number',
      textValue: '12',
      numberValue: 12,
      booleanValue: false,
    };
    expect(applyOrderFields([num], [ORDER[0]!])).toEqual([
      num,
      text('Order number', '000-0000000-0000000'),
    ]);
  });

  it('two text candidates of the same name: the first one only is replaced, the second sent back as is', () => {
    const base = [text('Merchant', 'a', 'f4'), text('Merchant', 'b', 'f5')];
    expect(applyOrderFields(base, [ORDER[1]!])).toEqual([
      text('Merchant', 'Amazon.fr', 'f4'),
      text('Merchant', 'b', 'f5'),
    ]);
  });

  it('a foreign field « Couleur » is copied as is (#109); base first, creations after', () => {
    expect(applyOrderFields([COULEUR], ORDER)).toEqual([
      COULEUR,
      text('Order number', '000-0000000-0000000'),
      text('Merchant', 'Amazon.fr'),
      text('Order URL', ORDER_URL),
    ]);
  });

  it('never mutates the base', () => {
    const base = [text('Order number', '', 'f2')];
    applyOrderFields(base, ORDER);
    expect(base).toEqual([text('Order number', '', 'f2')]);
  });
});

describe('orderFieldsMatch (FR-023, SC-003)', () => {
  const READ = [
    COULEUR,
    text('Order number', '000-0000000-0000000', 'n1'),
    text('Merchant', 'Amazon.fr', 'n2'),
    text('Order URL', ORDER_URL, 'n3'),
  ];

  it('exact → true; an extra read field is tolerated', () => {
    expect(orderFieldsMatch(READ, ORDER)).toBe(true);
  });

  it('different value → false', () => {
    expect(
      orderFieldsMatch([...READ.slice(0, 2), text('Merchant', 'Autre', 'n2'), READ[3]!], ORDER),
    ).toBe(false);
  });

  it('absent field → false', () => {
    expect(orderFieldsMatch(READ.slice(0, 3), ORDER)).toBe(false);
  });

  it('two read fields of the same name → false', () => {
    expect(
      orderFieldsMatch([...READ, text('Order number', '000-0000000-0000000', 'n4')], ORDER),
    ).toBe(false);
  });

  it('different type → false', () => {
    const num: EntityField = {
      id: 'n1',
      type: 'number',
      name: 'Order number',
      textValue: '000-0000000-0000000',
      numberValue: 0,
      booleanValue: false,
    };
    expect(orderFieldsMatch([num, READ[2]!, READ[3]!], ORDER)).toBe(false);
  });

  it.each([null, undefined])('%s → false', (read) => {
    expect(orderFieldsMatch(read, ORDER)).toBe(false);
  });

  it('edge spaces of a read name are ignored', () => {
    expect(
      orderFieldsMatch([text(' Order number ', '000-0000000-0000000', 'n1')], [ORDER[0]!]),
    ).toBe(true);
  });
});

describe('currentFields', () => {
  it.each([null, undefined])('%s → []', (current) => {
    expect(currentFields(current)).toEqual([]);
  });

  it('copies (not the same references) with the properties of copyField', () => {
    const source = { ...COULEUR, extra: 'ignored' } as EntityField;
    const out = currentFields([source]);
    expect(out).toEqual([
      {
        id: 'f1',
        name: 'Couleur',
        type: 'text',
        textValue: 'Rouge',
        numberValue: 0,
        booleanValue: false,
      },
    ]);
    expect(out[0]).not.toBe(source);
  });
});
