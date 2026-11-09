import { Window } from 'happy-dom';
import { amazonFrExtractor as ex } from '@/content/merchants/amazon-fr/extractor';
import { ORDER_URL } from './fixtures';

/**
 * Characterization of `resolveDocuments` on a synthetic page covering every path: trigger read from `href` or from
 * `data-a-popover`, trigger without a usable URL, foreign trigger, trigger matched by several selectors, menu answering
 * an error, menu that throws, link already known, foreign PDF link in the menu.
 */
const PAGE = `
  <div data-component="orderId">Commande n° 999-0000000-0000042</div>
  <a href="/documents/download/direct-1/invoice.pdf">Facture</a>
  <span data-component="orderInvoice">
    <a href="" data-a-popover='{"name":"x","url":"/your-orders/invoice/popover?orderId=A"}'>Facture</a>
  </span>
  <a href="/gp/shared-cs/ajax/invoice/invoice.html?orderId=B">Facture</a>
  <span data-a-popover="invoice/popover sans url">Facture</span>
  <span data-a-popover='{"url":"https://evil.example.com/invoice/popover?orderId=C"}'>Facture</span>
  <span data-a-popover='{"url":"/your-orders/invoice/popover?orderId=D"}'>Facture</span>
  <span data-a-popover='{"url":"/gp/shared-cs/ajax/invoice/invoice.html?orderId=E"}'>Facture</span>
`;

const MENU_A = `
  <a href="/documents/download/direct-1/invoice.pdf">déjà connue</a>
  <a href="/documents/download/menu-a-1/invoice.pdf">Facture 1</a>
  <a href="https://evil.example.com/x.pdf">externe</a>
  <a href="/documents/download/menu-a-2/invoice.pdf">Facture 2</a>
`;
const MENU_E = `<a href="/documents/download/menu-a-2/invoice.pdf">doublon</a><a href="/x/menu-e.pdf">Facture 3</a>`;

function page(html: string) {
  const window = new Window({ url: ORDER_URL });
  window.document.write(html);
  return window.document as unknown as Document;
}

describe('amazonFrExtractor.resolveDocuments — characterization', () => {
  it('collects the menus in order, ignores failures, foreign and duplicate links', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url.includes('orderId=A')) return new Response(MENU_A, { status: 200 });
      if (url.includes('orderId=B')) return new Response('', { status: 500 });
      if (url.includes('orderId=D')) throw new TypeError('network');
      return new Response(MENU_E, { status: 200 });
    });
    const docs = await ex.resolveDocuments(
      page(PAGE),
      new URL(ORDER_URL),
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "https://www.amazon.fr/your-orders/invoice/popover?orderId=A",
          {
            "credentials": "include",
          },
        ],
        [
          "https://www.amazon.fr/your-orders/invoice/popover?orderId=D",
          {
            "credentials": "include",
          },
        ],
        [
          "https://www.amazon.fr/gp/shared-cs/ajax/invoice/invoice.html?orderId=B",
          {
            "credentials": "include",
          },
        ],
        [
          "https://www.amazon.fr/gp/shared-cs/ajax/invoice/invoice.html?orderId=E",
          {
            "credentials": "include",
          },
        ],
      ]
    `);
    expect(docs).toMatchInlineSnapshot(`
      [
        {
          "id": "detected-0",
          "kind": "invoice",
          "label": "facture-amazon-999-0000000-0000042.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/documents/download/direct-1/invoice.pdf",
        },
        {
          "id": "detected-1",
          "kind": "invoice",
          "label": "facture-amazon-999-0000000-0000042-2.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/documents/download/menu-a-1/invoice.pdf",
        },
        {
          "id": "detected-2",
          "kind": "invoice",
          "label": "facture-amazon-999-0000000-0000042-3.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/documents/download/menu-a-2/invoice.pdf",
        },
        {
          "id": "detected-3",
          "kind": "invoice",
          "label": "facture-amazon-999-0000000-0000042-4.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/x/menu-e.pdf",
        },
      ]
    `);
  });

  it('without order number nor trigger: direct links only, no request', async () => {
    const fetchMock = vi.fn();
    const docs = await ex.resolveDocuments(
      page(
        '<a href="/documents/download/z/invoice.pdf">F</a><a href="/documents/download/y/invoice.pdf">F</a>',
      ),
      new URL(ORDER_URL),
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(docs).toMatchInlineSnapshot(`
      [
        {
          "id": "detected-0",
          "kind": "invoice",
          "label": "facture-amazon.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/documents/download/z/invoice.pdf",
        },
        {
          "id": "detected-1",
          "kind": "invoice",
          "label": "facture-amazon-2.pdf",
          "origin": "detected",
          "url": "https://www.amazon.fr/documents/download/y/invoice.pdf",
        },
      ]
    `);
  });
});
