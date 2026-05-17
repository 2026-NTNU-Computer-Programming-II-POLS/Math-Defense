<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { loading, error, login, register, mfaRequired, verifyMfa, cancelMfa } = useAuth()

const isLogin = ref(
  route.query.mode === 'login' || (!route.query.mode && !!route.query.next),
)
const email = ref('')
const password = ref('')
const playerName = ref('')
const role = ref('student')
const mfaCode = ref('')

const title = computed(() => isLogin.value ? 'Log In' : 'Register')

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

function handleCancelMfa(): void {
  mfaCode.value = ''
  cancelMfa()
}

function validate(): string {
  if (!email.value) return 'Please enter your email'
  if (!password.value) return 'Please enter your password'
  if (isLogin.value) return ''
  if (!playerName.value.trim()) return 'Please enter your player name'
  if (playerName.value.trim().length > 50) return 'Player name cannot exceed 50 characters'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) return 'Please enter a valid email address'
  if (password.value.length < PASSWORD_MIN || password.value.length > PASSWORD_MAX) {
    return `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters long`
  }
  if (!/[a-zA-Z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    return 'Password must contain both letters and numbers'
  }
  return ''
}

function getNextPath(): string {
  // F-BUG-10: the old check (`startsWith('/') && !startsWith('//')`) was
  // fooled by backslash and unicode variants (`/\\evil.com`, `/%2fevil.com`)
  // that browsers / vue-router still resolve as a foreign origin. Resolve
  // through `URL` against the current origin and require an exact origin
  // match before honouring the redirect target.
  const raw = typeof route.query.next === 'string' ? route.query.next : ''
  if (!raw) return '/'
  // Reject backslashes outright — they are never a legitimate part of a
  // same-origin in-app path and only show up in protocol-confusion attacks.
  if (raw.includes('\\')) return '/'
  try {
    const resolved = new URL(raw, window.location.origin)
    if (resolved.origin !== window.location.origin) return '/'
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return '/'
  }
}

async function submit(): Promise<void> {
  if (mfaRequired.value) {
    if (!mfaCode.value || !/^\d{6}$/.test(mfaCode.value)) {
      error.value = 'Please enter a 6-digit verification code'
      return
    }
    const ok = await verifyMfa(mfaCode.value)
    if (ok) router.push(getNextPath())
    return
  }

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
  if (ok) router.push(getNextPath())
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-panel rune-panel">
      <h2 class="auth-title">{{ mfaRequired ? 'Two-Factor Authentication' : title }}</h2>

      <form class="auth-form" @submit.prevent="submit">
        <template v-if="mfaRequired">
          <p class="mfa-hint">Please enter the 6-digit code from your authenticator app</p>
          <label class="auth-field">
            <span>Verification Code</span>
            <input
              v-model="mfaCode"
              class="rune-input"
              type="text"
              inputmode="numeric"
              pattern="\d{6}"
              maxlength="6"
              autocomplete="one-time-code"
              placeholder="000000"
              required
              @input="clearError"
            />
          </label>
        </template>

        <template v-else>
          <label class="auth-field">
            <span>Email</span>
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
              <span>Player Name</span>
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
              <span>Role</span>
              <select v-model="role" class="rune-input">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
          </template>

          <label class="auth-field">
            <span>Password</span>
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
            <li :class="{ met: passwordRules.length }">At least 8 characters</li>
            <li :class="{ met: passwordRules.hasLetter }">Contains letters</li>
            <li :class="{ met: passwordRules.hasDigit }">Contains numbers</li>
          </ul>
        </template>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? 'Loading…' : (mfaRequired ? 'Verify' : title) }}
        </button>
      </form>

      <template v-if="mfaRequired">
        <button class="btn toggle-btn" @click="handleCancelMfa">← Back to Login</button>
      </template>
      <template v-else>
        <button class="btn toggle-btn" @click="toggleMode">
          {{ isLogin ? 'No account? Register' : 'Already have an account? Log in' }}
        </button>
      </template>

      <p v-if="isLogin && !mfaRequired" class="demo-hint">
        Demo Account: <code>demo@mathdefense.local</code> / <code>Demo1234</code>
      </p>

      <button v-if="!mfaRequired" class="btn back-btn" @click="router.push('/')">← Back to Menu</button>
    </div>
  </div>
</template>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
}

.auth-panel {
  width: 380px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-title {
  /* Rune-flavoured title: retain monospace explicitly now that --font-main
     is system-ui (Phase 1). */
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
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
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.rune-input { width: 100%; }

.auth-error { font-size: var(--text-sm); color: var(--enemy-red); }

.mfa-hint {
  font-size: var(--text-sm);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  opacity: 0.8;
  margin: 0;
  text-align: center;
}

.password-rules {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  opacity: 0.7;
}

.password-rules li::before {
  content: '✕ ';
  color: var(--enemy-red);
}

.password-rules li.met::before {
  content: '✓ ';
  color: var(--gold);
  text-shadow: var(--gold-shadow);
}

.password-rules li.met {
  opacity: 0.5;
}

.demo-hint {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  opacity: 0.6;
  margin: 0;
}

.demo-hint code {
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-family: inherit;
}

.toggle-btn, .back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.toggle-btn:hover, .back-btn:hover {
  background: var(--axis);
  color: var(--stone-dark);
}
</style>
