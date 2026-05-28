export interface HttpJsonOptions {
  method?: string;
  token?: string | undefined;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function requestJson<T>(baseUrl: string, path: string, options: HttpJsonOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const response = await fetch(urlJoin(baseUrl, path), init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return await response.json() as T;
}

export async function requestForm<T>(baseUrl: string, path: string, form: FormData, token?: string): Promise<T> {
  const response = await fetch(urlJoin(baseUrl, path), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return await response.json() as T;
}

export function urlJoin(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
