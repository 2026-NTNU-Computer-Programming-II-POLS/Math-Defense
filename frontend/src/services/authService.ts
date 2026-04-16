import { api } from './api'

export interface TokenResponse {
  access_token: string
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
    // credentials: 'same-origin' sends the HTTP-only auth cookie so the
    // backend can revoke the token and clear it.
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    const url = base ? `${base}/api/auth/logout` : '/api/auth/logout'
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {
      // Best-effort: server unreachable is fine, cookie eventually expires.
    })
  },
}
