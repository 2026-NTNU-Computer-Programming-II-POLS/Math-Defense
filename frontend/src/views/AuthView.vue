<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { loading, error, login, register } = useAuth()

const isLogin = ref(true)
const username = ref('')
const password = ref('')

const title = computed(() => isLogin.value ? '登入' : '註冊')

// Mirror backend constraints (backend/app/schemas/auth.py):
//   username: 3-50 chars, [a-zA-Z0-9_-] only
//   password: 8-128 chars, must contain at least one letter and one digit
const USERNAME_MIN = 3
const USERNAME_MAX = 50
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

function toggleMode(): void {
  isLogin.value = !isLogin.value
  error.value = ''
}

function validate(u: string, p: string): string {
  if (!u) return '請輸入玩家名稱'
  if (!p) return '請輸入密碼'
  if (isLogin.value) return ''
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return `玩家名稱需 ${USERNAME_MIN}-${USERNAME_MAX} 字`
  }
  if (!USERNAME_PATTERN.test(u)) {
    return '玩家名稱僅能包含英數、底線、連字號'
  }
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) {
    return `密碼需 ${PASSWORD_MIN}-${PASSWORD_MAX} 字`
  }
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) {
    return '密碼需同時包含英文字母與數字'
  }
  return ''
}

async function submit(): Promise<void> {
  const u = username.value.trim()
  const p = password.value
  username.value = u
  const msg = validate(u, p)
  if (msg) {
    error.value = msg
    return
  }
  const ok = isLogin.value ? await login(u, p) : await register(u, p)
  if (ok) router.push('/')
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-panel rune-panel">
      <h2 class="auth-title">{{ title }}</h2>

      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-field">
          <span>玩家名稱</span>
          <input v-model="username" class="rune-input" type="text" autocomplete="username" required />
        </label>
        <label class="auth-field">
          <span>密碼</span>
          <input
            v-model="password"
            class="rune-input"
            type="password"
            :autocomplete="isLogin ? 'current-password' : 'new-password'"
            required
          />
        </label>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? '請稍候…' : title }}
        </button>
      </form>

      <button class="btn toggle-btn" @click="toggleMode">
        {{ isLogin ? '沒有帳號？前往註冊' : '已有帳號？前往登入' }}
      </button>

      <button class="btn back-btn" @click="router.push('/')">← 返回主選單</button>
    </div>
  </div>
</template>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.auth-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
  text-align: center;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--axis);
}

.rune-input { width: 100%; }

.auth-error { font-size: 11px; color: var(--enemy-red); }

.toggle-btn, .back-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
}

.toggle-btn:hover, .back-btn:hover {
  background: var(--axis);
  color: var(--stone-dark);
}
</style>
