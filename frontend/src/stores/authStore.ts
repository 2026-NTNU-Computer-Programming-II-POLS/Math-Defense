/**
 * authStore — user authentication state Pinia Store
 *
 * Authentication is cookie-based (HTTP-only). The store does not hold a token;
 * login state is determined by calling /auth/me and checking whether a user
 * object comes back.
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
  const user = ref<User | null>(null)
  const initializing = ref(false)

  // Exposed so the router guard can await the /auth/me probe before making
  // access decisions (fixes M-07: no more granting access with a stale token
  // string during the init window).
  let _initResolve: (() => void) | null = null
  const initPromise = ref<Promise<void> | null>(null)

  const isLoggedIn = computed(() => user.value !== null)

  async function init(): Promise<void> {
    initializing.value = true
    initPromise.value = new Promise<void>((resolve) => { _initResolve = resolve })
    try {
      const res = await authService.me()
      user.value = { id: res.id, username: res.username }
    } catch {
      // Cookie is invalid / expired / absent — user stays logged out
      user.value = null
    } finally {
      initializing.value = false
      _initResolve?.()
      _initResolve = null
      initPromise.value = null
    }
  }

  function setUser(u: User): void {
    user.value = u
  }

  function clearAuth(): void {
    user.value = null
  }

  async function logout(): Promise<void> {
    // Server clears the HTTP-only cookie in its response.
    await authService.logout()
    clearAuth()
    // Serialize close-modal → navigate → toast so a 401 triggered mid-modal
    // doesn't leave the user trapped behind stacked overlays (cf. F-7/F-8/F-9).
    try {
      const { useUiStore } = await import('@/stores/uiStore')
      const uiStore = useUiStore()
      if (uiStore.modalVisible) {
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

  return { user, isLoggedIn, initializing, initPromise, setUser, logout, init }
})
