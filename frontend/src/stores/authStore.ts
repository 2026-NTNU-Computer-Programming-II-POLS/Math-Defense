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

  function logout(): void {
    clearAuth()
    // If the user is on a protected route (e.g. /game), navigate away so the
    // view unmounts. That releases the engine, useSessionSync/useGameLoop
    // listeners, and any cached per-user state — otherwise a subsequent login
    // as a different account would reuse stale in-game state.
    const PROTECTED = new Set(['game', 'leaderboard'])
    const currentName = router.currentRoute.value.name as string | undefined
    if (currentName && PROTECTED.has(currentName)) {
      router.push({ name: 'auth' }).catch(() => { /* navigation failures are non-fatal */ })
    }
  }

  return { token, user, isLoggedIn, initializing, setToken, setUser, logout, init }
})
