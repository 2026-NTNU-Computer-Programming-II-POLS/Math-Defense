<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { loading, error, login, register } = useAuth()

const isLogin = ref(
  route.query.mode === 'login' || (!route.query.mode && !!route.query.next),
)
const email = ref('')
const password = ref('')
const playerName = ref('')
const role = ref('student')

const title = computed(() => isLogin.value ? '登入' : '註冊')

const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

const passwordRules = reactive({
  length: false,
  hasLetter: false,
  hasDigit: false,
})

function updatePasswordRules(p: string): void {
  passwordRules.length = p.length >= PASSWORD_MIN
  passwordRules.hasLetter = /[a-zA-Z]/.test(p)
  passwordRules.hasDigit = /[0-9]/.test(p)
}

function clearError(): void {
  if (error.value) error.value = ''
}

function onPasswordInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  password.value = value
  clearError()
  if (!isLogin.value) updatePasswordRules(value)
}

function toggleMode(): void {
  isLogin.value = !isLogin.value
  error.value = ''
  if (!isLogin.value) updatePasswordRules(password.value)
}

function validate(): string {
  if (!email.value) return '請輸入電子信箱'
  if (!password.value) return '請輸入密碼'
  if (isLogin.value) return ''
  if (!playerName.value.trim()) return '請輸入玩家名稱'
  if (playerName.value.trim().length > 50) return '玩家名稱不可超過 50 字'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) return '請輸入有效的電子信箱'
  if (password.value.length < PASSWORD_MIN || password.value.length > PASSWORD_MAX) {
    return `密碼需 ${PASSWORD_MIN}-${PASSWORD_MAX} 字`
  }
  if (!/[a-zA-Z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    return '密碼需同時包含英文字母與數字'
  }
  return ''
}

async function submit(): Promise<void> {
  const e = email.value.trim()
  const p = password.value
  email.value = e
  const msg = validate()
  if (msg) {
    error.value = msg
    return
  }
  const ok = isLogin.value
    ? await login(e, p)
    : await register(e, p, playerName.value.trim(), role.value)
  if (ok) {
    const raw = typeof route.query.next === 'string' ? route.query.next : ''
    const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
    router.push(next)
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-panel rune-panel">
      <h2 class="auth-title">{{ title }}</h2>

      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-field">
          <span>電子信箱</span>
          <input
            v-model="email"
            class="rune-input"
            type="email"
            autocomplete="email"
            required
            @input="clearError"
          />
        </label>

        <template v-if="!isLogin">
          <label class="auth-field">
            <span>玩家名稱</span>
            <input
              v-model="playerName"
              class="rune-input"
              type="text"
              autocomplete="nickname"
              required
              @input="clearError"
            />
          </label>

          <label class="auth-field">
            <span>身份</span>
            <select v-model="role" class="rune-input">
              <option value="student">學生</option>
              <option value="teacher">教師</option>
            </select>
          </label>
        </template>

        <label class="auth-field">
          <span>密碼</span>
          <input
            :value="password"
            class="rune-input"
            type="password"
            :autocomplete="isLogin ? 'current-password' : 'new-password'"
            required
            @input="onPasswordInput"
          />
        </label>

        <ul v-if="!isLogin" class="password-rules">
          <li :class="{ met: passwordRules.length }">至少 8 個字元</li>
          <li :class="{ met: passwordRules.hasLetter }">包含英文字母</li>
          <li :class="{ met: passwordRules.hasDigit }">包含數字</li>
        </ul>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? '請稍候…' : title }}
        </button>
      </form>

      <button class="btn toggle-btn" @click="toggleMode">
        {{ isLogin ? '沒有帳號？前往註冊' : '已有帳號？前往登入' }}
      </button>

      <p v-if="isLogin" class="demo-hint">
        體驗帳號：<code>demo@mathdefense.local</code> / <code>Demo1234</code>
      </p>

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
  width: 360px;
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

.password-rules {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--axis);
  opacity: 0.7;
}

.password-rules li::before {
  content: '✕ ';
  color: var(--enemy-red);
}

.password-rules li.met::before {
  content: '✓ ';
  color: var(--gold);
}

.password-rules li.met {
  opacity: 0.5;
}

.demo-hint {
  text-align: center;
  font-size: 10px;
  color: var(--axis);
  opacity: 0.6;
  margin: 0;
}

.demo-hint code {
  color: var(--gold);
  font-family: inherit;
}

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
