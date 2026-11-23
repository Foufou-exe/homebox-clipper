import { createHomeBoxClient } from '@/background/homebox/client';
import { log } from '@/shared/logger';
import { json, mockFetch, networkError } from './fetch-mock';

vi.mock('@/shared/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

/** Client: addExternalLink (spec 025, contracts/homebox-external-link.md). Fictitious values only. */
const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const ORDER = 'https://www.amazon.example/order-details?orderID=999-0000000-0000001';
const link = { url: ORDER, title: 'Order page - Amazon.example' };
const make = (m: ReturnType<typeof mockFetch>) =>
  createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch });

describe('client HomeBox: addExternalLink (spec 025)', () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it('E1: POST JSON with the exact body, Bearer key to the instance origin only', async () => {
    const m = mockFetch(json(201, { id: 'e1' }));
    expect(await make(m).addExternalLink('e/1', link)).toEqual({ ok: true, value: undefined });
    const call = m.calls[0]!;
    expect(call.method).toBe('POST');
    expect(new URL(call.url).origin).toBe(BASE);
    expect(new URL(call.url).pathname).toBe('/api/v1/entities/e%2F1/attachments/external');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(call.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(call.body as string)).toEqual({
      source_type: 'link',
      external_id: ORDER,
      title: link.title,
      attachment_type: 'attachment',
    });
  });

  it.each([401, 403])('E2: %i gives UNAUTHORIZED', async (status) => {
    const r = await make(mockFetch(json(status, {}))).addExternalLink('e1', link);
    expect(r).toEqual({ ok: false, error: 'UNAUTHORIZED', httpStatus: status });
  });

  it.each([400, 404, 422, 500])(
    'E3: %i gives ORDER_LINK_FAILED with its status',
    async (status) => {
      const r = await make(mockFetch(json(status, {}))).addExternalLink('e1', link);
      expect(r).toEqual({ ok: false, error: 'ORDER_LINK_FAILED', httpStatus: status });
    },
  );

  it('E4: a network error gives HOMEBOX_UNREACHABLE', async () => {
    expect(await make(mockFetch(networkError())).addExternalLink('e1', link)).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
  });

  it('E5: logs only the endpoint template, never the address, the title or the id', async () => {
    const m = mockFetch(json(201, {}), networkError());
    const client = make(m);
    await client.addExternalLink('e-secret-id', link);
    await client.addExternalLink('e-secret-id', link);
    const calls = vi.mocked(log).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const text = JSON.stringify(calls);
    expect(text).toContain('POST /entities/{id}/attachments/external');
    for (const secret of [
      'orderID',
      '999-0000000-0000001',
      'amazon.example',
      'Order page',
      'e-secret-id',
      KEY,
    ])
      expect(text).not.toContain(secret);
  });
});
