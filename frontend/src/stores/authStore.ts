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
import { readCookie, SESSION_HINT_COOKIE_NAME } from '@/services/api'
import { appBus } from '@/lib/app-bus'
import router from '@/router'
import { useTokenProbe } from '@/composables/useTokenProbe'

export type UserRole = 'admin' | 'teacher' | 'student'

export interface User {
  id: string
  email: string
  player_name: string
  role: UserRole
  ia_unlock_earned: boolean
  // Rolling fraction (0.0–1.0) of the last 10 completed sessions whose IA
  // was answered correctly. Read at level start by the path renderer to
  // drive concrete-fading on y-axis labels (spec §17).
  ia_recent_accuracy: number
}

function mapMeResponseToUser(res: MeResponse): User {
  return {
    id: res.id,
    email: res.email,
    player_name: res.player_name,
    role: res.role as UserRole,
    ia_unlock_earned: res.ia_unlock_earned ?? false,
    ia_recent_accuracy: res.ia_recent_accuracy ?? 0,
  }
}

/**
 * Push the endpoint marker preferences from a /me response into uiStore.
 * Lazy-imported so authStore stays free of an eager uiStore dependency
 * (uiStore in turn imports authStore via the modal-on-logout subscription;
 * lazy import breaks the would-be cycle).
 */
async function hydrateEndpointMarkerFromMe(res: MeResponse): Promise<void> {
  if (
    res.endpoint_marker_style === undefined
    && res.endpoint_marker_custom_dataurl === undefined
    && res.endpoint_hit_fx === undefined
  ) return
  try {
    const { useUiStore } = await import('@/stores/uiStore')
    useUiStore().applyServerEndpointMarker({
      style: res.endpoint_marker_style ?? null,
      customDataUrl: res.endpoint_marker_custom_dataurl,
      hitFx: res.endpoint_hit_fx ?? null,
    })
  } catch (e) {
    console.warn('[authStore] endpoint marker hydration failed:', e)
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initializing = ref(false)
  const probe = useTokenProbe(user)
  // Set by handleSessionExpiry() once api.ts has exhausted its refresh-and-retry
  // budget on a 401. GameView.onBeforeRouteLeave reads this to suppress the
  // misleading "Leave game?" confirmation when the navigation is being driven
  // by expiry, not by a user clicking Exit Run.
  const sessionExpired = ref(false)

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
      // No hint cookie → no session. Skip the probe so unauthenticated
      // visitors don't see /me + /refresh 401s in DevTools on every load.
      if (!readCookie(SESSION_HINT_COOKIE_NAME)) {
        user.value = null
        return
      }
      const res = await authService.me()
      user.value = mapMeResponseToUser(res)
      sessionExpired.value = false
      probe.start()
      void hydrateEndpointMarkerFromMe(res)
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
    sessionExpired.value = false
    probe.start()
  }

  function clearAuth(): void {
    user.value = null
    probe.stop()
  }

  /**
   * Called by the api.ts 401 interceptor once the session is unrecoverable —
   * either a refresh-and-retry already failed, or the non-httponly
   * `has_session` hint cookie was absent so refresh was skipped (it would
   * 401 anyway). Idempotent: concurrent 401s (e.g. probe + WAVE_END push)
   * all land here but only the first one shows the modal and clears auth.
   *
   * Shows a sticky "Session expired" modal instead of silently redirecting
   * to /auth. Without this, a mid-game expiry would trigger the GameView
   * `onBeforeRouteLeave` guard and pop a misleading "Leave game?" confirm —
   * the player has no idea their session is the actual cause.
   */
  function handleSessionExpiry(): void {
    if (sessionExpired.value) return
    sessionExpired.value = true
    clearAuth()
    const meta = router.currentRoute.value.meta
    if (!meta.requiresAuth) return

    void (async () => {
      try {
        const { useUiStore } = await import('@/stores/uiStore')
        useUiStore().showModal(
          'Session expired',
          'Your session has expired. Please sign in again. Any in-progress run will not be saved.',
          () => {
            router.push({ name: 'auth' }).catch(() => {})
          },
          { sticky: true },
        )
      } catch {
        // uiStore unavailable (very early bootstrap) — fall back to a
        // silent redirect so the user isn't stranded on a protected page.
        router.push({ name: 'auth' }).catch(() => {})
      }
    })()
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
      // Intentionally NOT calling hydrateEndpointMarkerFromMe here:
      // refreshProfile is invoked by LevelSelectView on mount, which races
      // with an in-flight pushEndpointMarkerToServer fired by a fresh upload
      // in ProfileView. If /me lands first the response still has the old
      // (or null) marker fields, which would wipe the user's just-uploaded
      // image from the local cache. Marker hydration happens once at init();
      // after that, local + PUT is the source of truth.
    } catch {
      // 401 handler in api.ts deals with auth failures; transient errors are
      // intentionally swallowed so Star-5 keeps its previous gating state.
    }
  }

  async function updatePlayerName(playerName: string): Promise<void> {
    await authService.updatePlayerName(playerName)
    if (user.value) user.value = { ...user.value, player_name: playerName }
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
    sessionExpired,
    setUser,
    clearAuth,
    handleSessionExpiry,
    logout,
    init,
    refreshProfile,
    updatePlayerName,
    stopProbe: probe.stop,
  }
})
