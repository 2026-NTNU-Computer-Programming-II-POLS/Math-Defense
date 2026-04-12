/**
 * api.ts — fetch wrapper + authentication interceptor
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

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

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

  const token = getToken()
  if (token && token.length > 0) headers['Authorization'] = `Bearer ${token}`

  const url = API_BASE_URL && path.startsWith('/') ? `${API_BASE_URL}${path}` : path
  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    // 401 interceptor: access token expired / rejected by server. Clear local
    // auth state and (if on a protected route) navigate to /auth so the user
    // isn't stranded on a blank panel with repeating errors. Dynamic import
    // avoids a static cycle (api → authStore → authService → api).
    //
    // Await logout() so the modal-close + navigation finish before the
    // ApiError bubbles up. If a modal is already visible (e.g. "Sync Failed"),
    // logout() force-closes it first so we don't stack overlays (F-9).
    if (res.status === 401) {
      try {
        const { useAuthStore } = await import('@/stores/authStore')
        await useAuthStore().logout()
      } catch {
        // Pinia not installed yet (very early bootstrap) — best-effort cleanup
        localStorage.removeItem('auth_token')
      }
    }
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get<T>(path: string) {
    return request<T>(path)
  },
  post<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
}
