import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { storeOrderUrl } from './fixtures';

/** The "Invoice" menu is only loaded from the origin of the store of the page (FR-008, Q-U9). */
describe.each(AMAZON_STORES.map((s) => [s.id, s] as const))('resolveDocuments on %s', (_id, s) => {
  const others = AMAZON_STORES.filter((o) => o.id !== s.id);
  const url = storeOrderUrl(s);
  const page = (html: string) => {
    const window = new Window({ url });
    window.document.write(html);
    return window.document as unknown as Document;
  };

  it('menus of another store or site are never requested; foreign PDF links are dropped', async () => {
    const html = [
      '<div data-component="orderId">999-0000000-0000042</div>',
      '<span data-a-popover=\'{"url":"/your-orders/invoice/popover?orderId=A"}\'>x</span>',
      ...others.map(
        (o) =>
          `<span data-a-popover='{"url":"${o.origin}/your-orders/invoice/popover?orderId=X"}'>x</span>`,
      ),
      '<span data-a-popover=\'{"url":"https://evil.example/invoice/popover?orderId=Y"}\'>x</span>',
      ...others.map((o) => `<a href="${o.origin}/documents/download/foreign/invoice.pdf">x</a>`),
    ].join('');
    const menu = [
      '<a href="/documents/download/own/invoice.pdf">ok</a>',
      ...others.map((o) => `<a href="${o.origin}/documents/download/other/invoice.pdf">no</a>`),
    ].join('');
    const fetchMock = vi.fn(async (u: string) => {
      void u;
      return new Response(menu, { status: 200 });
    });
    const docs = await createAmazonExtractor(s).resolveDocuments(
      page(html),
      new URL(url),
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `${s.origin}/your-orders/invoice/popover?orderId=A`,
    ]);
    expect(docs.map((d) => d.url)).toEqual([`${s.origin}/documents/download/own/invoice.pdf`]);
  });
});
