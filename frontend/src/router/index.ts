import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

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
