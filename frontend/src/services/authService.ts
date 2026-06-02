import { api, readCookie, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, REQUEST_TIMEOUT_MS, type ApiOptions } from './api'

export interface TokenResponse {
  token_type: string
  // Identity fields are absent on an MFA-challenge response (mfa_required:
  // true); they are present only once login completes.
  id?: string
  email?: string
  player_name?: string
  role?: string
  mfa_required?: boolean
  mfa_token?: string | null
}

export interface RegisterAcceptedResponse {
  detail: string
}

export interface MeResponse {
  id: string
  email: string
  player_name: string
  role: string
  is_email_verified?: boolean
  mfa_enabled?: boolean
  ia_unlock_earned?: boolean
  ia_recent_accuracy?: number
  // Endpoint marker (P*) preferences persisted server-side. `null` (or
  // omitted) means the player has not set this field on the server and the
  // frontend should keep using its local default / current localStorage value.
  endpoint_marker_style?: 'star' | 'gorilla' | 'custom' | null
  endpoint_marker_custom_dataurl?: string | null
  endpoint_hit_fx?: 'random' | 'fragments' | 'crying' | 'angry' | null
  // Profile-initials avatar persisted server-side. `null` means the player has
  // not chosen an avatar yet (or has cleared it). Letters and colour move
  // together — the backend rejects half-filled state.
  profile_initials_letters?: string | null
  profile_initials_color?: string | null
}

export interface EndpointMarkerUpdate {
  style: 'star' | 'gorilla' | 'custom' | null
  custom_dataurl: string | null
  hit_fx: 'random' | 'fragments' | 'crying' | 'angry' | null
}

export interface ProfileInitialsUpdate {
  letters: string | null
  color: string | null
}

export const authService = {
  register(email: string, password: string, playerName: string, role: string = 'student') {
    // M-05: register no longer auto-logs in. A successful response is a 202
    // acknowledgement (generic body, no auth cookies); the user must verify
    // their email and then sign in via /login.
    return api.post<RegisterAcceptedResponse>('/api/auth/register', {
      email,
      password,
      player_name: playerName,
      role,
    })
  },
  login(email: string, password: string) {
    return api.post<TokenResponse>('/api/auth/login', { email, password })
  },
  mfaChallenge(mfaToken: string, code: string) {
    return api.post<TokenResponse>('/api/auth/mfa/challenge', { mfa_token: mfaToken, code })
  },
  me() {
    return api.get<MeResponse>('/api/auth/me')
  },
  updatePlayerName(playerName: string) {
    return api.put<MeResponse>('/api/auth/profile/name', { player_name: playerName })
  },
  updateEndpointMarker(payload: EndpointMarkerUpdate, opts: ApiOptions = {}) {
    // signal is threaded through so ProfileView's rapid-change abort cancels
    // the in-flight PUT — without this the abort only flipped the local
    // controller flag and two PUTs could land at the server out of order.
    return api.put<MeResponse>('/api/auth/profile/endpoint-marker', payload, opts)
  },
  updateProfileInitials(payload: ProfileInitialsUpdate) {
    return api.put<MeResponse>('/api/auth/profile/initials', payload)
  },
  changePassword(currentPassword: string, newPassword: string) {
    return api.post<void>('/api/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  },
  logout(): Promise<void> {
    // Uses raw fetch intentionally: avoids the api.ts 401 interceptor, which
    // calls handleSessionExpiry() → no recursive logout loop if the server
    // returns 401 on this request.
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    const url = base ? `${base}/api/auth/logout` : '/api/auth/logout'
    const headers: Record<string, string> = {}
    const csrf = readCookie(CSRF_COOKIE_NAME)
    if (csrf) headers[CSRF_HEADER_NAME] = csrf
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: controller.signal,
    }).then((res) => {
      clearTimeout(timeoutId)
      // M14: surface 5xx so the caller can retry. 4xx (e.g. 401 on an already-
      // expired cookie) is treated as success — the session is already gone.
      if (res.status >= 500) throw new Error(`logout ${res.status}`)
    }).catch((err) => {
      clearTimeout(timeoutId)
      // Abort (timeout) is swallowed — local state will still be cleared by the caller.
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    })
  },
}
