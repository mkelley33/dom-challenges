export const API_BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Headers can arrive as a Headers instance, a record, or a [string, string][] tuple list
  // (RequestInit['headers']'s type). Merging via the Headers API handles all three uniformly;
  // spreading init.headers into a plain object would silently misread the tuple-list form.
  const headers = new Headers({ 'Content-Type': 'application/json' });
  new Headers(init?.headers).forEach((value, key) => {
    headers.set(key, value);
  });

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with ${String(response.status)}`);
  }

  return (await response.json()) as T;
}
