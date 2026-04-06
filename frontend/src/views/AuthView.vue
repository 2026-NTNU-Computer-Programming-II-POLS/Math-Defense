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

function toggleMode(): void {
  isLogin.value = !isLogin.value
  error.value = ''
}

async function submit(): Promise<void> {
  const ok = isLogin.value
    ? await login(username.value, password.value)
    : await register(username.value, password.value)
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
