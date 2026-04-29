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

export type UserRole = 'admin' | 'teacher' | 'student'

export interface User {
  id: string
  email: string
  player_name: string
  role: UserRole
  avatar_url: string | null
}

const TOKEN_PROBE_INTERVAL_MS = 15_000

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initializing = ref(false)
  let probeTimer: ReturnType<typeof setInterval> | null = null

  let _initResolve: (() => void) | null = null
  const initPromise = ref<Promise<void> | null>(null)

  const isLoggedIn = computed(() => user.value !== null)
  const userRole = computed(() => user.value?.role ?? null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isTeacher = computed(() => user.value?.role === 'teacher')
  const isStudent = computed(() => user.value?.role === 'student')

  async function init(): Promise<void> {
    initializing.value = true
    initPromise.value = new Promise<void>((resolve) => { _initResolve = resolve })
    try {
      const res = await authService.me()
      user.value = {
        id: res.id,
        email: res.email,
        player_name: res.player_name,
        role: res.role as UserRole,
        avatar_url: res.avatar_url ?? null,
      }
      startTokenProbe()
    } catch {
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
    startTokenProbe()
  }

  function clearAuth(): void {
    user.value = null
    stopTokenProbe()
  }

  /**
   * Called by the api.ts 401 interceptor. Clears local auth state and
   * redirects without making any API call — avoids recursive logout loops
   * when authService.logout() itself uses the api wrapper.
   */
  function handleSessionExpiry(): void {
    clearAuth()
    const meta = router.currentRoute.value.meta
    if (meta.requiresAuth) {
      router.push({ name: 'auth' }).catch(() => {})
    }
  }

  function startTokenProbe(): void {
    if (probeTimer !== null) return
    probeTimer = setInterval(async () => {
      if (user.value === null) { stopTokenProbe(); return }
      try {
        await authService.me()
      } catch {
        // 401 branch in api.ts handles logout
      }
    }, TOKEN_PROBE_INTERVAL_MS)
  }

  function stopTokenProbe(): void {
    if (probeTimer === null) return
    clearInterval(probeTimer)
    probeTimer = null
  }

  async function updateAvatar(avatarUrl: string | null): Promise<void> {
    await authService.updateAvatar(avatarUrl)
    if (user.value) user.value = { ...user.value, avatar_url: avatarUrl }
  }

  async function logout(): Promise<void> {
    try {
      await authService.logout()
    } catch {
      // Server-side invalidation is best-effort; always clear local state.
    }
    clearAuth()

    try {
      const { useTalentStore } = await import('@/stores/talentStore')
      useTalentStore().clear()
    } catch { /* Pinia not installed yet */ }

    try {
      const { useTerritoryStore } = await import('@/stores/territoryStore')
      useTerritoryStore().clear()
    } catch { /* Pinia not installed yet */ }

    try {
      const { useUiStore } = await import('@/stores/uiStore')
      const uiStore = useUiStore()
      if (uiStore.modalVisible) uiStore.dismissModal()
    } catch { /* Pinia not installed yet */ }

    const meta = router.currentRoute.value.meta
    if (meta.requiresAuth) {
      try {
        await router.push({ name: 'auth' })
      } catch {
        // navigation failures are non-fatal
      }
    }
  }

  return {
    user,
    isLoggedIn,
    userRole,
    isAdmin,
    isTeacher,
    isStudent,
    initializing,
    initPromise,
    setUser,
    clearAuth,
    handleSessionExpiry,
    logout,
    init,
    updateAvatar,
  }
})
