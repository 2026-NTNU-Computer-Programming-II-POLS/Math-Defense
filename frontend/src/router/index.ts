import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const PROTECTED_ROUTES = new Set(['game', 'leaderboard', 'rankings', 'profile', 'achievements', 'talents', 'classes', 'level-select', 'initial-answer', 'territory-list', 'territory-detail', 'territory-play', 'territory-rankings'])
const ADMIN_ROUTES = new Set(['admin-teachers', 'admin-classes', 'admin-students'])
const TEACHER_ROUTES = new Set(['territory-create', 'teacher-dashboard'])
const STUDENT_ROUTES = new Set(['game'])

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'menu',
      component: () => import('@/views/MenuView.vue'),
    },
    {
      path: '/level-select',
      name: 'level-select',
      component: () => import('@/views/LevelSelectView.vue'),
    },
    {
      path: '/initial-answer',
      name: 'initial-answer',
      component: () => import('@/views/InitialAnswerView.vue'),
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
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/achievements',
      name: 'achievements',
      component: () => import('@/views/AchievementView.vue'),
    },
    {
      path: '/talents',
      name: 'talents',
      component: () => import('@/views/TalentTreeView.vue'),
    },
    {
      path: '/classes',
      name: 'classes',
      component: () => import('@/views/ClassView.vue'),
    },
    {
      path: '/territory',
      name: 'territory-list',
      component: () => import('@/views/TerritoryListView.vue'),
    },
    {
      path: '/territory/create',
      name: 'territory-create',
      component: () => import('@/views/TeacherTerritorySetup.vue'),
    },
    {
      path: '/territory/:id',
      name: 'territory-detail',
      component: () => import('@/views/TerritoryDetailView.vue'),
    },
    {
      path: '/territory/:id/play/:slotId',
      name: 'territory-play',
      component: () => import('@/views/TerritoryResultView.vue'),
    },
    {
      path: '/territory/:id/rankings',
      name: 'territory-rankings',
      component: () => import('@/views/RankingsView.vue'),
    },
    {
      path: '/rankings',
      name: 'rankings',
      component: () => import('@/views/RankingsView.vue'),
    },
    {
      path: '/teacher',
      name: 'teacher-dashboard',
      component: () => import('@/views/TeacherDashboard.vue'),
    },
    {
      path: '/admin/teachers',
      name: 'admin-teachers',
      component: () => import('@/views/AdminView.vue'),
    },
    {
      path: '/admin/classes',
      name: 'admin-classes',
      component: () => import('@/views/AdminView.vue'),
    },
    {
      path: '/admin/students',
      name: 'admin-students',
      component: () => import('@/views/AdminView.vue'),
    },
  ],
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
  const routeName = to.name as string
  const isProtected = PROTECTED_ROUTES.has(routeName) || ADMIN_ROUTES.has(routeName)
  if (!isProtected) return true

  const auth = useAuthStore()
  if (auth.initPromise) await auth.initPromise
  if (!auth.isLoggedIn) {
    return { name: 'auth', query: { mode: 'login', next: to.fullPath } }
  }

  if (ADMIN_ROUTES.has(routeName) && !auth.isAdmin) {
    return { name: 'menu' }
  }
  if (TEACHER_ROUTES.has(routeName) && !(auth.isTeacher || auth.isAdmin)) {
    return { name: 'menu' }
  }
  if (STUDENT_ROUTES.has(routeName) && !auth.isStudent) {
    return { name: 'menu' }
  }

  return true
})

export default router
