/**
 * authStore — 使用者認證狀態 Pinia Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'

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
      // Token is invalid or expired — clear it
      token.value = null
      user.value = null
      localStorage.removeItem('auth_token')
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

  function logout(): void {
    token.value = null
    user.value = null
    localStorage.removeItem('auth_token')
  }

  return { token, user, isLoggedIn, initializing, setToken, setUser, logout, init }
})
