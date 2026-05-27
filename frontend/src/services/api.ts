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
export const REQUEST_TIMEOUT_MS = 10_000

// In dev, leave empty so Vite proxy handles "/api" → backend (vite.config.ts).
// In prod, set VITE_API_BASE_URL to the backend origin (e.g. https://api.example.com)
// so requests work without an external reverse proxy.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const CSRF_COOKIE_NAME = 'csrf_token'
export const CSRF_HEADER_NAME = 'X-CSRF-Token'
const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Endpoints whose 401 means "these credentials are wrong", not "your session
// expired". Clearing local auth state on these would silently log out a
// previously-authenticated user who mistypes a password while signing in as
// a different account on /auth.
const CREDENTIAL_CHECK_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/mfa/challenge',
  '/api/auth/register',
])

// Backend mints a refresh cookie scoped to this path; calling it rotates the
// short-lived access cookie without forcing the user to re-authenticate.
const REFRESH_PATH = '/api/auth/refresh'

// Coalesce concurrent refresh attempts: when several in-flight requests all
// hit 401 at once (e.g. token probe + wave-end push), they share a single
// /refresh round-trip instead of racing and rotating the refresh cookie
// multiple times.
let _refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight
  _refreshInFlight = (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const csrf = readCookie(CSRF_COOKIE_NAME)
    if (csrf) headers[CSRF_HEADER_NAME] = csrf
    const url = API_BASE_URL ? `${API_BASE_URL}${REFRESH_PATH}` : REFRESH_PATH
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        signal: controller.signal,
      })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  })()
  try {
    return await _refreshInFlight
  } finally {
    _refreshInFlight = null
  }
}

async function notifySessionExpired(): Promise<void> {
  try {
    const { useAuthStore } = await import('@/stores/authStore')
    useAuthStore().handleSessionExpiry()
  } catch {
    // Pinia not installed yet (very early bootstrap) — best-effort
  }
}

export function readCookie(name: string): string | null {
  // document.cookie is "k=v; k2=v2"; pick by exact name.
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  for (const raw of document.cookie.split(';')) {
    const c = raw.trim()
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length))
  }
  return null
}

// Transient errors worth retrying: network failures (ApiError.status === 0),
// 502/503/504 from a reloading backend. We only retry idempotent GETs —
// POST/PATCH/DELETE can't be retried safely without server-side idempotency
// keys (a WAVE_END update might double-apply).
const RETRY_STATUSES = new Set([0, 502, 503, 504])
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 300

function shouldRetry(method: string, err: unknown): boolean {
  if (method !== 'GET') return false
  if (!(err instanceof ApiError)) return false
  return RETRY_STATUSES.has(err.status)
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

// F-BUG-16: a 403 with a CSRF-shaped detail means our cookie was missing or
// stale (server cleared/rotated it). Refetch a safe GET to mint a fresh
// csrf_token cookie, then retry the original request once.
// Safe GET that runs through the same /api proxy + CsrfMiddleware path as
// the original request, so the response will Set-Cookie the csrf_token if
// it was missing client-side. /api/auth/me is cheap and always handled.
const CSRF_REFRESH_PATH = '/api/auth/me'
// FastAPI's RequestValidationError handler returns `detail` as an array of
// {loc, type, msg} objects. Without normalization the Error constructor
// coerces it via String() and the user sees "[object Object]".
function formatErrorDetail(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    if (detail.length === 0) return null
    const parts = detail.map((d) => {
      if (d && typeof d === 'object') {
        const o = d as { loc?: unknown; msg?: unknown }
        const loc = Array.isArray(o.loc) ? o.loc.filter((x) => x !== 'body').join('.') : ''
        const msg = typeof o.msg === 'string' ? o.msg : 'Invalid value'
        return loc ? `${loc}: ${msg}` : msg
      }
      return String(d)
    })
    return parts.join('; ')
  }
  if (typeof detail === 'object') {
    try { return JSON.stringify(detail) } catch { return String(detail) }
  }
  return String(detail)
}

function looksLikeCsrfReject(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false
  if (e.status !== 403) return false
  const d = (e.detail ?? '').toLowerCase()
  return d.includes('csrf')
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let lastErr: unknown
  let csrfRefreshed = false
  let authRefreshAttempted = false
  let attempt = 0
  while (attempt <= MAX_RETRIES) {
    try {
      return await requestOnce<T>(path, options)
    } catch (e) {
      lastErr = e
      const method = (options.method ?? 'GET').toUpperCase()
      // 401 refresh-and-retry: the backend's access cookie is short-lived
      // (15 min default) but the refresh cookie lives much longer. Before
      // treating the session as expired and bouncing the user to /auth —
      // which would mid-run pop a "Leave game?" prompt — try rotating the
      // access cookie once. Skip for the refresh endpoint itself (would
      // recurse) and for credential-check paths (401 there means "wrong
      // password", not session expiry).
      const is401Recoverable =
        e instanceof ApiError
        && e.status === 401
        && !CREDENTIAL_CHECK_PATHS.has(path)
        && path !== REFRESH_PATH
      if (is401Recoverable && !authRefreshAttempted) {
        authRefreshAttempted = true
        const refreshed = await tryRefresh()
        if (refreshed) {
          // Don't bump `attempt`: a successful refresh always deserves one
          // retry, even if the original request already burned its retry
          // budget on a flaky network earlier.
          continue
        }
        await notifySessionExpired()
        throw e
      }
      if (is401Recoverable) {
        // Refresh was attempted and the retry still 401'd — session is
        // genuinely gone.
        await notifySessionExpired()
        throw e
      }
      // Single-shot CSRF refresh-and-retry. Bypasses the GET-only retry guard
      // because the original request was rejected pre-server-state-change, so
      // re-issuing it is safe even for unsafe methods.
      if (
        !csrfRefreshed
        && UNSAFE_METHODS.has(method)
        && looksLikeCsrfReject(e)
      ) {
        csrfRefreshed = true
        try { await requestOnce<unknown>(CSRF_REFRESH_PATH) } catch { /* best effort */ }
        continue
      }
      if (attempt < MAX_RETRIES && shouldRetry(method, e)) {
        // Exponential backoff with a small jitter to decorrelate concurrent
        // retries from different tabs/components.
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 100
        try { await wait(delay, options.signal ?? undefined) } catch { throw e }
        attempt++
        continue
      }
      throw e
    }
  }
  throw lastErr
}

async function requestOnce<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  // Double-submit CSRF: echo the csrf_token cookie (set by the backend
  // CsrfMiddleware) in the header on state-changing requests. If the
  // cookie is absent (middleware disabled, or first-ever request), we
  // skip the header — backend will mint one on this response.
  const method = (options.method ?? 'GET').toUpperCase()
  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE_NAME)
    if (csrf) headers[CSRF_HEADER_NAME] = csrf
  }

  // Compose a single AbortSignal from (a) the caller's signal, if any, and
  // (b) our own timeout. Either trigger aborts the fetch. Using a dedicated
  // controller (rather than AbortSignal.any / AbortSignal.timeout, which
  // aren't available everywhere) keeps this working on older browsers.
  // keepalive requests skip the timeout: the browser owns the socket through
  // page unload, so a JS-side abort timer would race the unload sequence.
  const controller = new AbortController()
  const callerSignal = options.signal
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (!options.keepalive) {
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  }
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
      // 'include' is required for cross-origin deployments (VITE_API_BASE_URL).
      credentials: 'include',
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
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = formatErrorDetail(body?.detail) ?? res.statusText
    // 401 handling has moved up to `request()` so a refresh-and-retry can run
    // before the session is declared expired.
    throw new ApiError(res.status, detail)
  }

  // 204 No Content — no body to parse; callers must type T as void/undefined.
  // The double cast through unknown makes the intentional unsafety explicit.
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export interface ApiOptions {
  signal?: AbortSignal
  // keepalive: true makes the request survive page unload (beforeunload / pagehide).
  // When set, the per-request timeout is skipped — the browser owns the socket until
  // the tab fully closes, so a JS-side abort timer would race against the unload.
  keepalive?: boolean
}

export const api = {
  get<T>(path: string, opts: ApiOptions = {}) {
    return request<T>(path, { signal: opts.signal })
  },
  post<T>(path: string, body: unknown, opts: ApiOptions = {}) {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body), signal: opts.signal, keepalive: opts.keepalive })
  },
  put<T>(path: string, body: unknown, opts: ApiOptions = {}) {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body), signal: opts.signal })
  },
  patch<T>(path: string, body: unknown, opts: ApiOptions = {}) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body), signal: opts.signal })
  },
  delete(path: string, opts: ApiOptions = {}): Promise<void> {
    return request<void>(path, { method: 'DELETE', signal: opts.signal })
  },
}
