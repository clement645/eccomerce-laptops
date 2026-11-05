import type { ApiErrorBody, HealthResponse } from '@repo/shared-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Base URL including the version prefix, e.g. https://api.example.co.ke/api/v1 */
  baseUrl: string;
  /** Returns the current in-memory access token, if any. */
  getAccessToken?: () => string | null | undefined;
  /** Custom fetch (e.g. Next.js fetch with caching options, or a test double). */
  fetch?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  // Resolve fetch per call so polyfills, test stubs and instrumentation installed later are used.
  const doFetch: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const token = options.getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let body: BodyInit | undefined;
    if (typeof Blob !== 'undefined' && init.body instanceof Blob) {
      // Files (e.g. image uploads) are sent as raw bytes with their own type.
      if (!headers.has('Content-Type') && init.body.type)
        headers.set('Content-Type', init.body.type);
      body = init.body;
    } else if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.body);
    }

    const { query: _query, body: _body, ...rest } = init;
    const response = await doFetch(url, { credentials: 'include', ...rest, headers, body });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      if (isErrorBody(payload)) {
        const { code, message, details, requestId } = payload.error;
        throw new ApiError(response.status, code, message, details, requestId);
      }
      throw new ApiError(
        response.status,
        'HTTP_ERROR',
        `Request failed with status ${response.status}`,
      );
    }

    return payload as T;
  }

  return {
    request,
    health: () => request<HealthResponse>('/health'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
