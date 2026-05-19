import { ref } from 'vue'
import { useAuthStore, type UserRole } from '@/stores/authStore'
import { authService } from '@/services/authService'

export function useAuth() {
  const authStore = useAuthStore()
  const loading = ref(false)
  const error = ref('')
  const mfaRequired = ref(false)
  let mfaToken = ''

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    mfaRequired.value = false
    mfaToken = ''
    try {
      const res = await authService.login(email, password)
      if (res.mfa_required && res.mfa_token) {
        mfaRequired.value = true
        mfaToken = res.mfa_token
        return false
      }
      try {
        const me = await authService.me()
        authStore.setUser({
          id: me.id,
          email: me.email,
          player_name: me.player_name,
          role: me.role as UserRole,
          avatar_url: me.avatar_url ?? null,
          ia_unlock_earned: me.ia_unlock_earned ?? false,
          ia_recent_accuracy: me.ia_recent_accuracy ?? 0,
        })
      } catch {
        authStore.setUser({
          id: res.id ?? '',
          email: res.email ?? email,
          player_name: res.player_name ?? '',
          role: (res.role as UserRole) ?? 'student',
          avatar_url: res.avatar_url ?? null,
          ia_unlock_earned: false,
          ia_recent_accuracy: 0,
        })
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Login failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function verifyMfa(code: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const res = await authService.mfaChallenge(mfaToken, code)
      try {
        const me = await authService.me()
        authStore.setUser({
          id: me.id,
          email: me.email,
          player_name: me.player_name,
          role: me.role as UserRole,
          avatar_url: me.avatar_url ?? null,
          ia_unlock_earned: me.ia_unlock_earned ?? false,
          ia_recent_accuracy: me.ia_recent_accuracy ?? 0,
        })
      } catch {
        authStore.setUser({
          id: res.id ?? '',
          email: res.email ?? '',
          player_name: res.player_name ?? '',
          role: (res.role as UserRole) ?? 'student',
          avatar_url: res.avatar_url ?? null,
          ia_unlock_earned: false,
          ia_recent_accuracy: 0,
        })
      }
      mfaRequired.value = false
      mfaToken = ''
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Verification failed'
      return false
    } finally {
      loading.value = false
    }
  }

  function cancelMfa(): void {
    mfaRequired.value = false
    mfaToken = ''
    error.value = ''
  }

  async function register(
    email: string,
    password: string,
    playerName: string,
    role: string = 'student',
  ): Promise<boolean> {
    // M-05: the backend returns a fixed 202 acknowledgement and does NOT
    // issue auth cookies — the caller cannot tell whether the email was
    // newly created or already on file. The user completes onboarding by
    // verifying their email and then signing in via /login.
    loading.value = true
    error.value = ''
    try {
      await authService.register(email, password, playerName, role)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Registration failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await authStore.logout()
  }

  return { loading, error, login, register, logout, mfaRequired, verifyMfa, cancelMfa }
}
