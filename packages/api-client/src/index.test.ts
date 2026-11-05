import { describe, expect, it, vi } from 'vitest';
import { type ApiError, createApiClient } from './index.js';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('sends credentials, bearer token, query, and JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1/',
      getAccessToken: () => 'token-123',
      fetch: fetchMock,
    });

    await client.request('/products', {
      method: 'POST',
      body: { a: 1 },
      query: { page: 2, q: undefined },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/api/v1/products?page=2');
    expect(init?.credentials).toBe('include');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"a":1}');
  });

  it('maps the error envelope to ApiError', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Missing', requestId: 'r1' } }),
        ),
    });

    await expect(client.request('/x')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'r1',
    } satisfies Partial<ApiError>);
  });

  it('handles non-JSON error bodies', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
    });
    await expect(client.request('/x')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('sends files as raw bytes with their own content type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { id: 'm1' }));
    const client = createApiClient({ baseUrl: 'https://api.test', fetch: fetchMock });
    const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    await client.request('/admin/media', { method: 'POST', body: file });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get('Content-Type')).toBe('image/png');
    expect(init.body).toBe(file);
  });
});
