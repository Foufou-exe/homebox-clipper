import { fail, ok } from '@/shared/errors';
import { sendToTab } from '@/shared/messages';
import type { DetectedPurchase } from '@/shared/types';
import { AMAZON_SCRIPT, detect } from '@/background/detect';

const tab = { url: '' };
const executeScript = vi.fn(async (opts: unknown) => {
  void opts;
  return [];
});

vi.mock('@/platform', () => ({
  browser: {
    tabs: { get: vi.fn(async () => tab) },
    scripting: { executeScript: (opts: unknown) => executeScript(opts) },
    runtime: { onMessage: { addListener: vi.fn() } },
  },
}));
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  sendToTab: vi.fn(),
}));

const found = <T,>(value: T) => ({ value, selector: 'x' });
const purchase = (documents: DetectedPurchase['documents']): DetectedPurchase => ({
  source: 'amazon.com',
  pageUrl: 'https://www.amazon.com/your-orders/order-details',
  orderNumber: found('999-0000000-0000021'),
  orderDate: found('2026-11-09'),
  seller: found('Vendeur Fictif'),
  products: [
    {
      key: 'B00FAKE001',
      name: found('Produit fictif 1'),
      unitPrice: found(1111.11),
      currency: found('USD'),
      quantity: found(1),
      imageUrl: { value: null, reason: 'not_found' },
    },
  ],
  documents,
});

beforeEach(() => {
  executeScript.mockClear();
  vi.mocked(sendToTab).mockReset();
});

describe('detect: one script for the 8 stores (006, FR-001, FR-010)', () => {
  it('the injected script is /content-scripts/amazon.js', () => {
    expect(AMAZON_SCRIPT).toBe('/content-scripts/amazon.js');
  });

  it.each([
    'https://www.amazon.fr/your-orders/order-details',
    'https://www.amazon.de/your-orders/order-details',
    'https://www.amazon.com.be/your-orders/order-details',
    'https://www.amazon.com/your-orders/order-details',
  ])('%s: script injected, then amazon/extract', async (url) => {
    tab.url = url;
    vi.mocked(sendToTab).mockResolvedValue(ok(purchase([])) as never);
    expect((await detect(1)).ok).toBe(true);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 1 }, files: ['/content-scripts/amazon.js'] });
  });

  it.each(['https://www.amazon.ca/your-orders/order-details', 'http://www.amazon.de/x', 'https://www.amazon.com.evil.example/x'])(
    '%s: NOT_AN_ORDER_PAGE without injection',
    async (url) => {
      tab.url = url;
      expect(await detect(1)).toEqual(fail('NOT_AN_ORDER_PAGE'));
      expect(executeScript).not.toHaveBeenCalled();
    },
  );

  it('Amazon.com without PDF: INVOICE_MISSING warning, the import stays possible (US2)', async () => {
    tab.url = 'https://www.amazon.com/your-orders/order-details';
    vi.mocked(sendToTab).mockResolvedValue(ok(purchase([])) as never);
    const r = await detect(1);
    expect(r.ok && r.value.warnings).toEqual(['INVOICE_MISSING']);
  });
});

describe('detect: INVOICE_MISSING with delivery notes (007, Q-U12, R2.5)', () => {
  const doc = (kind: 'invoice' | 'delivery_note', i: number) => ({
    id: `detected-${i}`,
    origin: 'detected' as const,
    kind,
    label: `${kind}-${i}.pdf`,
    url: 'https://www.amazon.com/doc.pdf',
  });
  const warningsFor = async (documents: DetectedPurchase['documents']) => {
    tab.url = 'https://www.amazon.com/your-orders/order-details';
    vi.mocked(sendToTab).mockResolvedValue(ok(purchase(documents)) as never);
    const r = await detect(1);
    return r.ok ? r.value.warnings : [];
  };

  it('only a delivery note → INVOICE_MISSING', async () => {
    expect(await warningsFor([doc('delivery_note', 0)])).toContain('INVOICE_MISSING');
  });
  it('an invoice alone, or with a delivery note → no INVOICE_MISSING', async () => {
    expect(await warningsFor([doc('invoice', 0)])).not.toContain('INVOICE_MISSING');
    expect(await warningsFor([doc('invoice', 0), doc('delivery_note', 1)])).not.toContain('INVOICE_MISSING');
  });
  it('no document → INVOICE_MISSING, as today', async () => {
    expect(await warningsFor([])).toContain('INVOICE_MISSING');
  });
});
