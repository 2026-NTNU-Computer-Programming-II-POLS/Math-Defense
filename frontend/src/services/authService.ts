import { api } from './api'

export interface TokenResponse {
  token_type: string
  id: string
  email: string
  player_name: string
  role: string
  avatar_url: string | null
}

export interface MeResponse {
  id: string
  email: string
  player_name: string
  role: string
  avatar_url: string | null
}

export const authService = {
  register(email: string, password: string, playerName: string, role: string = 'student') {
    return api.post<TokenResponse>('/api/auth/register', {
      email,
      password,
      player_name: playerName,
      role,
    })
  },
  login(email: string, password: string) {
    return api.post<TokenResponse>('/api/auth/login', { email, password })
  },
  me() {
    return api.get<MeResponse>('/api/auth/me')
  },
  updateAvatar(avatarUrl: string | null) {
    return api.put<MeResponse>('/api/auth/profile/avatar', { avatar_url: avatarUrl })
  },
  logout(): Promise<void> {
    // Uses raw fetch intentionally: avoids the api.ts 401 interceptor, which
    // calls handleSessionExpiry() → no recursive logout loop if the server
    // returns 401 on this request.
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    const url = base ? `${base}/api/auth/logout` : '/api/auth/logout'
    const headers: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('csrf_token='))
      if (match) headers['X-CSRF-Token'] = decodeURIComponent(match.slice('csrf_token='.length))
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: controller.signal,
    }).then(() => {
      clearTimeout(timeoutId)
    }).catch((err) => {
      clearTimeout(timeoutId)
      // Abort (timeout) is swallowed — local state will still be cleared by the caller.
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    })
  },
}
