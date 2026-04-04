/**
 * authStore — 使用者認證狀態 Pinia Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface User {
  id: string
  username: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => token.value !== null)

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

  return { token, user, isLoggedIn, setToken, setUser, logout }
})
