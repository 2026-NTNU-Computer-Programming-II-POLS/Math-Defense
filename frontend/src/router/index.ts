import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { parseLevelJson } from '@/utils/parseHistoryState'

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
      if (!parseLevelJson(history.state?.level)) {
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
    // Backlog §24 — Replay/Spectate Mode. The :sessionId is a UUID (the
    // recorded session); the view fetches the seed + event log and re-drives
    // the engine deterministically.
    path: '/replay/:sessionId',
    name: 'replay',
    component: () => import('@/views/ReplayView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Backlog §24 Phase D — live spectate. WebSocket-driven; receives a
    // historical snapshot followed by live events as the recorded session
    // flushes them server-side.
    path: '/spectate/:sessionId',
    name: 'spectate',
    component: () => import('@/views/SpectateView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
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
    path: '/teacher/challenges',
    name: 'challenge-builder',
    component: () => import('@/views/ChallengeBuilder.vue'),
    meta: { requiresAuth: true, requiresRole: 'teacher' },
  },
  {
    path: '/challenge/:id',
    name: 'challenge-view',
    component: () => import('@/views/ChallengeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/challenge/:id/leaderboard',
    name: 'challenge-leaderboard',
    component: () => import('@/views/ChallengeLeaderboardView.vue'),
    meta: { requiresAuth: true },
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
    path: '/admin/seasons',
    name: 'admin-seasons',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' },
  },
  {
    // Backlog §27 — Empirical Validity Probe runner. ?study_id=...&form=pre|post|delay
    path: '/study/probe',
    name: 'study-probe',
    component: () => import('@/views/StudyProbeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Backlog §27 — Affect Likert survey. ?study_id=...&phase=pre|post
    path: '/study/affect',
    name: 'study-affect',
    component: () => import('@/views/AffectSurveyView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // Restore scroll on browser back/forward; otherwise start fresh routes at
  // the top so a previously-scrolled page doesn't leave the next one offset.
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(() => {
  const ui = useUiStore()
  if (ui.modalVisible) {
    // dismissModal handles resolving any pending showConfirm promise as
    // cancelled — direct mutation of modalVisible/modalCallback would leak it.
    ui.dismissModal({ force: true })
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
