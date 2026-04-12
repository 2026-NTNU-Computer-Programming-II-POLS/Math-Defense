/**
 * authStore — user authentication state Pinia Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'
import router from '@/router'

export interface User {
  id: string
  username: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const user = ref<User | null>(null)
  const initializing = ref(false)

  const isLoggedIn = computed(() => token.value !== null && user.value !== null)

  async function init(): Promise<void> {
    if (!token.value) return
    initializing.value = true
    try {
      const res = await authService.me()
      user.value = { id: res.id, username: res.username }
    } catch {
      // Token is invalid or expired — clear it (no route change; init() runs pre-mount)
      clearAuth()
    } finally {
      initializing.value = false
    }
  }

  function setToken(t: string): void {
    token.value = t
    localStorage.setItem('auth_token', t)
  }

  function setUser(u: User): void {
    user.value = u
  }

  function clearAuth(): void {
    token.value = null
    user.value = null
    localStorage.removeItem('auth_token')
  }

  async function logout(): Promise<void> {
    clearAuth()
    // Serialize close-modal → navigate → toast so a 401 triggered mid-modal
    // doesn't leave the user trapped behind stacked overlays (cf. F-7/F-8/F-9).
    // Dynamic import avoids a static cycle (authStore → uiStore → …).
    try {
      const { useUiStore } = await import('@/stores/uiStore')
      const uiStore = useUiStore()
      if (uiStore.modalVisible) {
        // Force-close any existing modal before we navigate. We intentionally
        // bypass the callback (modalCallback.value = null first) because the
        // modal's original caller is now mid-logout and any router.push it
        // wanted to run would race with ours.
        uiStore.modalCallback = null
        uiStore.modalVisible = false
      }
    } catch {
      // Pinia not installed yet (very early bootstrap) — skip modal cleanup.
    }

    const PROTECTED = new Set(['game', 'leaderboard'])
    const currentName = router.currentRoute.value.name as string | undefined
    if (currentName && PROTECTED.has(currentName)) {
      try {
        await router.push({ name: 'auth' })
      } catch {
        // navigation failures are non-fatal
      }
    }
  }

  return { token, user, isLoggedIn, initializing, setToken, setUser, logout, init }
})
