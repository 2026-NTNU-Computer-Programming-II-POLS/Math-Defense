import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const PROTECTED_ROUTES = new Set(['game', 'leaderboard'])

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'menu',
      component: () => import('@/views/MenuView.vue'),
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('@/views/GameView.vue'),
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('@/views/LeaderboardView.vue'),
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
    },
  ],
})

// Close any open modal on route change so an overlay from the previous view
// (e.g. "Game Over" triggering navigation) never bleeds into the next view.
// The callback fires on close, but here the navigation is already in progress,
// so we suppress it to avoid a navigation-during-navigation loop.
router.beforeEach(() => {
  const ui = useUiStore()
  if (ui.modalVisible) {
    ui.modalCallback = null
    ui.modalVisible = false
  }
  return true
})

router.beforeEach((to) => {
  if (!PROTECTED_ROUTES.has(to.name as string)) return true
  const auth = useAuthStore()
  // Token-hydrated-from-localStorage + in-flight /me validation: allow through.
  // Without the token check, a still-initializing anonymous user would be let in.
  if (auth.initializing && auth.token) return true
  if (auth.isLoggedIn) return true
  return { name: 'auth', query: { next: to.fullPath } }
})

export default router
