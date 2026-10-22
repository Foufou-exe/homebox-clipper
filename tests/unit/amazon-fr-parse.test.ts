import { cleanText, parseDateFr, parseOrderNumber, parsePriceFr, parseQuantity } from '@/content/merchants/amazon-fr/parse';

describe('parsePriceFr', () => {
  it.each([
    ['99,99 €', 99.99, 'EUR'],
    ['99,99 €', 99.99, 'EUR'],
    ['1 299,99 €', 1299.99, 'EUR'],
    ['1 299,99 €', 1299.99, 'EUR'],
    ['1.299,99 €', 1299.99, 'EUR'],
    ['EUR 12,00', 12, 'EUR'],
    ['$15.00', 15, 'USD'],
    ['£8.50', 8.5, 'GBP'],
    ['0,00 €', 0, 'EUR'],
  ])('%s → %d %s', (input, amount, currency) => {
    expect(parsePriceFr(input)).toEqual({ amount, currency });
  });

  it.each(['', 'Gratuit', '€'])('%s → null', (input) => {
    expect(parsePriceFr(input)).toBeNull();
  });
});

describe('parseDateFr', () => {
  it.each([
    ['22 octobre 2026', '2026-10-22'],
    ['1er février 2026', '2026-02-01'],
    ['3 fevrier 2026', '2026-02-03'],
    ['Commandé le 5 mai 2026', '2026-05-05'],
    ['14 août 2026', '2026-08-14'],
    ['5 janv. 2026', '2026-01-05'],
    ['31 décembre 2025', '2025-12-31'],
  ])('%s → %s', (input, expected) => {
    expect(parseDateFr(input)).toBe(expected);
  });

  it.each(['', '31 février 2026', '22 brumaire 2026', 'hier'])('%s → null', (input) => {
    expect(parseDateFr(input)).toBeNull();
  });
});

describe('parseOrderNumber', () => {
  it.each([
    ['123-4567890-1234567', '123-4567890-1234567'],
    ['Commande n° 123-4567890-1234567', '123-4567890-1234567'],
    ['N° de commande D01-1234567-1234567', 'D01-1234567-1234567'],
  ])('%s → %s', (input, expected) => {
    expect(parseOrderNumber(input)).toBe(expected);
  });

  it.each(['', '12-345-678', '1234-4567890-1234567'])('%s → null', (input) => {
    expect(parseOrderNumber(input)).toBeNull();
  });
});

describe('parseQuantity', () => {
  it.each([['3', 3], ['Qté : 2', 2], ['Quantité : 10', 10]])('%s → %d', (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });
  it.each(['', '0', 'abc'])('%s → null', (input) => expect(parseQuantity(input)).toBeNull());
});

describe('cleanText', () => {
  it('compresse les espaces et tronque à la limite', () => {
    expect(cleanText('  Clavier  \n sans   fil ')).toBe('Clavier sans fil');
    expect(cleanText('a'.repeat(300), 255)).toHaveLength(255);
  });
});
