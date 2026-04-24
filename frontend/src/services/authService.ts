import { api } from './api'

export interface TokenResponse {
  token_type: string
  id: string
  username: string
}

export const authService = {
  register(username: string, password: string) {
    return api.post<TokenResponse>('/api/auth/register', { username, password })
  },
  login(username: string, password: string) {
    return api.post<TokenResponse>('/api/auth/login', { username, password })
  },
  me() {
    return api.get<{ id: string; username: string }>('/api/auth/me')
  },
  logout() {
    // Bypass the api wrapper so the 401 interceptor (which itself calls
    // logout()) can never re-enter this path and create an infinite loop.
    // credentials: 'include' sends the HTTP-only auth cookie even when the
    // frontend and backend are on different origins (the normal prod topology),
    // so the backend can revoke the token and clear it.
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    const url = base ? `${base}/api/auth/logout` : '/api/auth/logout'
    const headers: Record<string, string> = {}
    // Best-effort CSRF echo — same double-submit pattern as api.ts. Skipped
    // silently if the cookie isn't present (middleware off, or very first hit).
    if (typeof document !== 'undefined') {
      const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('csrf_token='))
      if (match) headers['X-CSRF-Token'] = decodeURIComponent(match.slice('csrf_token='.length))
    }
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
    }).catch(() => {
      // Best-effort: server unreachable is fine, cookie eventually expires.
    })
  },
}
