import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresRole?: 'admin' | 'teacher' | 'student'
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'menu',
    component: () => import('@/views/MenuView.vue'),
  },
  {
    path: '/level-select',
    name: 'level-select',
    component: () => import('@/views/LevelSelectView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/initial-answer',
    name: 'initial-answer',
    component: () => import('@/views/InitialAnswerView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/game',
    name: 'game',
    component: () => import('@/views/GameView.vue'),
    meta: { requiresAuth: true},
    beforeEnter: () => {
      try {
        if (!history.state?.level) return { name: 'level-select', replace: true }
        JSON.parse(history.state.level)
      } catch {
        return { name: 'level-select', replace: true }
      }
    },
  },
  {
    path: '/leaderboard',
    name: 'leaderboard',
    component: () => import('@/views/LeaderboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/achievements',
    name: 'achievements',
    component: () => import('@/views/AchievementView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/talents',
    name: 'talents',
    component: () => import('@/views/TalentTreeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/classes',
    name: 'classes',
    component: () => import('@/views/ClassView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/territory',
    name: 'territory-list',
    component: () => import('@/views/TerritoryListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/territory/create',
    name: 'territory-create',
    component: () => import('@/views/TeacherTerritorySetup.vue'),
    meta: { requiresAuth: true, requiresRole: 'teacher' },
  },
  {
    path: '/territory/:id',
    name: 'territory-detail',
    component: () => import('@/views/TerritoryDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/territory/:id/play/:slotId',
    name: 'territory-play',
    component: () => import('@/views/TerritoryResultView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/territory/:id/rankings',
    name: 'territory-rankings',
    component: () => import('@/views/RankingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/rankings',
    name: 'rankings',
    component: () => import('@/views/RankingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/teacher',
    name: 'teacher-dashboard',
    component: () => import('@/views/TeacherDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: 'teacher' },
  },
  {
    path: '/admin/teachers',
    name: 'admin-teachers',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' },
  },
  {
    path: '/admin/classes',
    name: 'admin-classes',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' },
  },
  {
    path: '/admin/students',
    name: 'admin-students',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(() => {
  const ui = useUiStore()
  if (ui.modalVisible) {
    ui.modalCallback = null
    ui.modalVisible = false
  }
  return true
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const auth = useAuthStore()
  if (auth.initPromise) await auth.initPromise
  if (!auth.isLoggedIn) {
    return { name: 'auth', query: { mode: 'login', next: to.fullPath } }
  }

  const role = to.meta.requiresRole
  if (role === 'admin' && !auth.isAdmin) return { name: 'menu' }
  if (role === 'teacher' && !(auth.isTeacher || auth.isAdmin)) return { name: 'menu' }
  if (role === 'student' && !auth.isStudent) return { name: 'menu' }

  return true
})

export default router
