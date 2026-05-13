/**
 * authStore — user authentication state Pinia Store
 *
 * Authentication is cookie-based (HTTP-only). The store does not hold a token;
 * login state is determined by calling /auth/me and checking whether a user
 * object comes back.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService, type MeResponse } from '@/services/authService'
import { appBus } from '@/lib/app-bus'
import router from '@/router'

export type UserRole = 'admin' | 'teacher' | 'student'

export interface User {
  id: string
  email: string
  player_name: string
  role: UserRole
  avatar_url: string | null
  ia_unlock_earned: boolean
  // Rolling fraction (0.0–1.0) of the last 10 completed sessions whose IA
  // was answered correctly. Read at level start by the path renderer to
  // drive concrete-fading on y-axis labels (spec §17).
  ia_recent_accuracy: number
}

const TOKEN_PROBE_INTERVAL_MS = 15_000

function mapMeResponseToUser(res: MeResponse): User {
  return {
    id: res.id,
    email: res.email,
    player_name: res.player_name,
    role: res.role as UserRole,
    avatar_url: res.avatar_url ?? null,
    ia_unlock_earned: res.ia_unlock_earned ?? false,
    ia_recent_accuracy: res.ia_recent_accuracy ?? 0,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initializing = ref(false)
  let probeTimer: ReturnType<typeof setInterval> | null = null
  let probePageHideListener: (() => void) | null = null
  let probePageShowListener: (() => void) | null = null

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
      user.value = mapMeResponseToUser(res)
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
    // Defensive: if a previous interval is still alive (race during BFCache
    // restore or rapid login/logout cycles), kill it first so we never run
    // two intervals against the same store.
    if (probeTimer !== null) {
      clearInterval(probeTimer)
      probeTimer = null
    }
    probeTimer = setInterval(async () => {
      if (user.value === null) { stopTokenProbe(); return }
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        await authService.me()
      } catch {
        // 401 branch in api.ts handles logout
      }
    }, TOKEN_PROBE_INTERVAL_MS)

    // Install page-lifecycle listeners once. They persist across stop/start
    // so a BFCache restore can resume polling even after stopTokenProbe.
    if (typeof window !== 'undefined' && probePageHideListener === null) {
      probePageHideListener = () => {
        if (probeTimer !== null) {
          clearInterval(probeTimer)
          probeTimer = null
        }
      }
      window.addEventListener('pagehide', probePageHideListener)
    }
    if (typeof window !== 'undefined' && probePageShowListener === null) {
      probePageShowListener = () => {
        // Resume only if we still believe we are logged in.
        if (user.value !== null) startTokenProbe()
      }
      window.addEventListener('pageshow', probePageShowListener)
    }
  }

  function stopTokenProbe(): void {
    if (probeTimer !== null) {
      clearInterval(probeTimer)
      probeTimer = null
    }
    if (probePageHideListener !== null && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', probePageHideListener)
      probePageHideListener = null
    }
    if (probePageShowListener !== null && typeof window !== 'undefined') {
      window.removeEventListener('pageshow', probePageShowListener)
      probePageShowListener = null
    }
  }

  async function refreshProfile(): Promise<void> {
    // Pulls /me again so derived progression flags (ia_unlock_earned) reflect
    // any unlocks earned since login. LevelSelectView calls this on entry to
    // honour Pedagogical_Backlog_Spec.md §5.3: Star-5 unlocks on next entry
    // after a correct Initial-Answer phase.
    if (!user.value) return
    try {
      const res = await authService.me()
      user.value = mapMeResponseToUser(res)
    } catch {
      // 401 handler in api.ts deals with auth failures; transient errors are
      // intentionally swallowed so Star-5 keeps its previous gating state.
    }
  }

  async function updatePlayerName(playerName: string): Promise<void> {
    await authService.updatePlayerName(playerName)
    if (user.value) user.value = { ...user.value, player_name: playerName }
  }

  async function updateAvatar(avatarUrl: string | null): Promise<void> {
    await authService.updateAvatar(avatarUrl)
    if (user.value) user.value = { ...user.value, avatar_url: avatarUrl }
  }

  async function logout(): Promise<void> {
    // F-BUG-7: capture the user-id BEFORE clearAuth so we can scrub the
    // per-user recommendation-dismiss key. Without this a shared lab
    // device would leak one student's pref onto the next sign-in.
    const previousUserId = user.value?.id ?? null
    // M14: retry once on network / transient failure so a 5xx blip doesn't
    // leave the server-side cookie live. Local state is cleared regardless.
    try {
      await authService.logout()
    } catch {
      try {
        await authService.logout()
      } catch {
        // Server-side invalidation is best-effort; always clear local state.
      }
    }
    clearAuth()
    if (previousUserId !== null && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(`recommendation:dismissed:${previousUserId}`)
      } catch {
        // localStorage unavailable (private mode); non-critical.
      }
    }

    // F-ARCH-2: broadcast a single signal instead of dynamic-importing each
    // store. Each store subscribes to its own teardown on init, so adding a
    // new user-scoped store no longer requires editing this file.
    appBus.emit('auth:logout', { previousUserId })

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
    refreshProfile,
    updateAvatar,
    updatePlayerName,
    stopProbe: stopTokenProbe,
  }
})
