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
  logout() {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    const url = base ? `${base}/api/auth/logout` : '/api/auth/logout'
    const headers: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('csrf_token='))
      if (match) headers['X-CSRF-Token'] = decodeURIComponent(match.slice('csrf_token='.length))
    }
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
    }).catch(() => {})
  },
}
