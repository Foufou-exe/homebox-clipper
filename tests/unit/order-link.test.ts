import {
  DEFAULT_ORDER_LINK_SETTINGS,
  isOrderLinkSettings,
  orderLinkUrl,
} from '@/shared/order-link';

/** Order page link (spec 025, data-model §1). Fictitious values only. */
describe('isOrderLinkSettings', () => {
  it('accepts exactly { enabled: boolean }', () => {
    expect(isOrderLinkSettings({ enabled: true })).toBe(true);
    expect(isOrderLinkSettings({ enabled: false })).toBe(true);
  });

  it.each([null, undefined, 'x', 1, [], {}, { enabled: 'yes' }, { enabled: true, extra: 1 }])(
    'refuses %j',
    (x) => {
      expect(isOrderLinkSettings(x)).toBe(false);
    },
  );

  it('is off by default', () => {
    expect(DEFAULT_ORDER_LINK_SETTINGS).toEqual({ enabled: false });
  });
});

describe('orderLinkUrl', () => {
  it.each([
    'https://www.amazon.example/gp/your-account/order-details?orderID=999-0000000-0000001',
    'http://shop.example.com/order/1',
  ])('returns %s unchanged', (url) => {
    expect(orderLinkUrl(url)).toBe(url);
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'not a url',
    'ftp://shop.example.com/o',
    'javascript:alert(1)',
    'https://user:pwd@shop.example.com/o',
    'https://user@shop.example.com/o',
    `https://shop.example.com/${'a'.repeat(2048)}`,
  ])('refuses %j', (url) => {
    expect(orderLinkUrl(url)).toBeNull();
  });
});
