/**
 * api.ts — fetch wrapper + authentication interceptor
 *
 * Authentication is handled via HTTP-only cookies set by the backend.
 * No token is stored in localStorage or sent via Authorization header.
 */

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

// Requests over this wall-clock time are aborted. Keeps the UI from hanging
// indefinitely if the backend disappears; tuned above the slowest expected
// leaderboard page render and well below any human patience threshold.
const REQUEST_TIMEOUT_MS = 10_000

// In dev, leave empty so Vite proxy handles "/api" → backend (vite.config.ts).
// In prod, set VITE_API_BASE_URL to the backend origin (e.g. https://api.example.com)
// so requests work without an external reverse proxy.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  // Compose a single AbortSignal from (a) the caller's signal, if any, and
  // (b) our own timeout. Either trigger aborts the fetch. Using a dedicated
  // controller (rather than AbortSignal.any / AbortSignal.timeout, which
  // aren't available everywhere) keeps this working on older browsers.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const callerSignal = options.signal
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const url = API_BASE_URL && path.startsWith('/') ? `${API_BASE_URL}${path}` : path
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      // Send cookies (HTTP-only auth cookie) with every request.
      credentials: 'same-origin',
    })
  } catch (e) {
    // Caller-initiated abort: re-throw so consumers can detect & ignore it
    // (e.g. a newer request superseded this one). Otherwise the abort came
    // from our own timeout — surface as a dedicated ApiError so UIs can
    // distinguish "server is slow/down" from other network failures.
    if (e instanceof DOMException && e.name === 'AbortError') {
      if (callerSignal?.aborted) throw e
      throw new ApiError(0, 'Request timed out')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    // 401 interceptor: access token expired / rejected by server. Clear local
    // auth state and (if on a protected route) navigate to /auth so the user
    // isn't stranded on a blank panel with repeating errors.
    if (res.status === 401) {
      try {
        const { useAuthStore } = await import('@/stores/authStore')
        await useAuthStore().logout()
      } catch {
        // Pinia not installed yet (very early bootstrap) — best-effort
      }
    }
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface ApiOptions {
  signal?: AbortSignal
}

export const api = {
  get<T>(path: string, opts: ApiOptions = {}) {
    return request<T>(path, { signal: opts.signal })
  },
  post<T>(path: string, body: unknown, opts: ApiOptions = {}) {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body), signal: opts.signal })
  },
  patch<T>(path: string, body: unknown, opts: ApiOptions = {}) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body), signal: opts.signal })
  },
}
