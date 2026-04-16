import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'

export function useAuth() {
  const authStore = useAuthStore()
  const loading = ref(false)
  const error = ref('')

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      // The backend sets the HTTP-only auth cookie in its response.
      const res = await authService.login(username, password)
      try {
        const me = await authService.me()
        authStore.setUser({ id: me.id, username: me.username })
      } catch {
        // /me failed but login succeeded — use known data from login response
        authStore.setUser({ id: res.id ?? '', username: res.username ?? username })
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '登入失敗'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      // The backend sets the HTTP-only auth cookie in its response.
      const res = await authService.register(username, password)
      try {
        const me = await authService.me()
        authStore.setUser({ id: me.id, username: me.username })
      } catch {
        // /me failed but register succeeded — use known data from register response
        authStore.setUser({ id: res.id ?? '', username: res.username ?? username })
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '註冊失敗'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await authStore.logout()
  }

  return { loading, error, login, register, logout }
}
