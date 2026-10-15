// Minimal typed API client shared across the storefront and the Charm Agent widget.

const API = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

let accessToken: string | null = localStorage.getItem('htc_access') || null;
let refreshToken: string | null = localStorage.getItem('htc_refresh') || null;

export function setTokens(access?: string | null, refresh?: string | null): void {
  if (access === undefined) return;
  accessToken = access;
  refreshToken = refresh ?? refreshToken;
  if (accessToken) localStorage.setItem('htc_access', accessToken);
  else localStorage.removeItem('htc_access');
  if (refreshToken) localStorage.setItem('htc_refresh', refreshToken);
  else localStorage.removeItem('htc_refresh');
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401 && accessToken && refreshToken) {
    // Attempt a silent refresh once
    try {
      const ref = await fetch(`${API}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const refJson = await ref.json();
      if (refJson.success) {
        setTokens(refJson.data.accessToken, refJson.data.refreshToken);
        const retry = await fetch(`${API}${path}`, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
        return (await retry.json()) as ApiResponse<T>;
      }
    } catch {
      // fall through to error
    }
  }

  return (await res.json()) as ApiResponse<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Derive a stable anonymous id for the cart/agent handshake, persisted per browser.
export function getAnonymousId(): string {
  let anon = localStorage.getItem('htc_anon');
  if (!anon) {
    anon = `anon_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('htc_anon', anon);
  }
  return anon;
}
