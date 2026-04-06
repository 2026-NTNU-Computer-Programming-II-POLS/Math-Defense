import { api } from './api'

export interface TokenResponse {
  access_token: string
  token_type: string
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
}
