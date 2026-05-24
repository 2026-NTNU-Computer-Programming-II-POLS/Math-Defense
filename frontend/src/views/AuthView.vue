<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { loading, error, login, register, mfaRequired, verifyMfa, cancelMfa } = useAuth()

interface DevAccount {
  label: string
  email: string
  password: string
}

// MIRROR: backend/app/seed.py _DEV_ACCOUNTS.
// `import.meta.env.DEV` is statically replaced at build time, so the
// `false` branch is eliminated from production bundles and the
// credentials never appear in the shipped JS.
const DEV_ACCOUNTS: readonly DevAccount[] = import.meta.env.DEV
  ? [
      { label: 'Teacher', email: 'teacher@mathdefense.local', password: 'TeacherDev2026!' },
      { label: 'Student', email: 'student@mathdefense.local', password: 'StudentDev2026!' },
    ]
  : []

const isLogin = ref(
  route.query.mode === 'login' || (!route.query.mode && !!route.query.next),
)
const email = ref('')
const password = ref('')
const playerName = ref('')
const role = ref('student')
const mfaCode = ref('')
// M-05: register no longer auto-logs in. After a successful submission we
// show a generic confirmation message and switch the form back to login.
const registrationSubmitted = ref(false)

const title = computed(() => isLogin.value ? 'Log In' : 'Register')

const PASSWORD_MIN = 8
// Aligns with backend bcrypt's 72-byte input cap (see BCRYPT_MAX_BYTES in
// backend/app/utils/security.py). A 73+ char password would otherwise pass
// frontend validation only to be rejected with a 422 from the backend.
const PASSWORD_MAX = 72

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
  registrationSubmitted.value = false
  if (!isLogin.value) updatePasswordRules(password.value)
}

function handleCancelMfa(): void {
  mfaCode.value = ''
  cancelMfa()
}

function fillDevAccount(account: DevAccount): void {
  // Switch the form to login mode and prefill — the dev accounts are
  // pre-seeded on the backend, so there is nothing to register.
  isLogin.value = true
  registrationSubmitted.value = false
  email.value = account.email
  password.value = account.password
  clearError()
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
  if (isLogin.value) {
    const ok = await login(e, p)
    if (ok) router.push(getNextPath())
    return
  }
  const ok = await register(e, p, playerName.value.trim(), role.value)
  if (ok) {
    registrationSubmitted.value = true
    isLogin.value = true
    password.value = ''
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-panel rune-panel">
      <h2 class="auth-title">{{ mfaRequired ? 'Two-Factor Authentication' : title }}</h2>

      <div v-if="registrationSubmitted" class="auth-notice">
        If the email is available, an account was created. Please check your
        inbox to verify the address, then sign in below.
      </div>

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

            <!-- M-04: self-service registration only allows student role.
                 Teacher accounts require administrator setup. -->
            <label class="auth-field">
              <span>Role</span>
              <div class="role-display">Student</div>
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

      <button v-if="!mfaRequired" class="btn back-btn" @click="router.push('/')">← Back to Menu</button>

      <!-- Dev-only credential hint. Mirrors backend/app/seed.py _DEV_ACCOUNTS;
           DEV_ACCOUNTS is empty in production builds so this whole section
           renders nothing. -->
      <div v-if="!mfaRequired && DEV_ACCOUNTS.length > 0" class="dev-hint">
        <p class="dev-hint-title">Dev accounts (click to fill)</p>
        <button
          v-for="account in DEV_ACCOUNTS"
          :key="account.email"
          type="button"
          class="dev-hint-item"
          @click="fillDevAccount(account)"
        >
          <span class="dev-hint-role">{{ account.label }}</span>
          <code class="dev-hint-credential">{{ account.email }}</code>
          <code class="dev-hint-credential">{{ account.password }}</code>
        </button>
      </div>
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
.auth-notice {
  font-size: var(--text-sm);
  color: var(--text-secondary, currentColor);
  padding: 0.75rem;
  margin-bottom: 1rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  opacity: 0.9;
}

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

.role-display {
  padding: 4px 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  color: var(--axis);
  font-size: var(--text-xs);
}

.dev-hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--axis);
  border-radius: 4px;
  opacity: 0.85;
}

.dev-hint-title {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  letter-spacing: 1px;
  text-align: center;
  opacity: 0.7;
}

.dev-hint-item {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-column-gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--axis);
  border-radius: 2px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--axis);
}

.dev-hint-item:hover {
  background: var(--axis);
  color: var(--stone-dark);
}

.dev-hint-role {
  grid-row: span 2;
  font-size: var(--text-xs);
  font-weight: bold;
  letter-spacing: 1px;
  text-shadow: var(--gold-shadow);
}

.dev-hint-credential {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  word-break: break-all;
}

.dev-hint-item:hover .dev-hint-credential {
  color: var(--stone-dark);
  text-shadow: none;
}
</style>
