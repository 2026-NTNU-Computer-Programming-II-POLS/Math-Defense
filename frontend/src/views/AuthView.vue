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
    <div class="card auth-card">
      <!-- Two-factor verification (no mockup design — themed to palette) -->
      <template v-if="mfaRequired">
        <h2 class="auth-title">Two-Factor Authentication</h2>

        <form class="auth-form" @submit.prevent="submit">
          <p class="mfa-hint">
            Please enter the 6-digit code from your authenticator app
          </p>
          <div class="field">
            <label>Verification Code</label>
            <input
              v-model="mfaCode"
              type="text"
              inputmode="numeric"
              pattern="\d{6}"
              maxlength="6"
              autocomplete="one-time-code"
              placeholder="000000"
              required
              @input="clearError"
            />
          </div>

          <div v-if="error" class="auth-error">{{ error }}</div>

          <button class="btn btn-primary" type="submit" :disabled="loading">
            <span class="label">{{ loading ? 'Loading…' : 'Verify' }}</span>
          </button>
        </form>

        <div class="auth-foot">
          <button class="btn btn-ghost auth-block" @click="handleCancelMfa">
            ← Back to Login
          </button>
        </div>
      </template>

      <!-- Login / Register -->
      <template v-else>
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: isLogin }"
            type="button"
            @click="!isLogin && toggleMode()"
          >Login</button>
          <button
            class="tab"
            :class="{ active: !isLogin }"
            type="button"
            @click="isLogin && toggleMode()"
          >Register</button>
        </div>

        <div v-if="registrationSubmitted" class="auth-notice">
          If the email is available, an account was created. Please check your
          inbox to verify the address, then sign in below.
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <div class="field">
            <label>Email</label>
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              @input="clearError"
            />
          </div>

          <template v-if="!isLogin">
            <div class="field">
              <label>Player Name</label>
              <input
                v-model="playerName"
                type="text"
                autocomplete="nickname"
                required
                @input="clearError"
              />
            </div>

            <!-- M-04: self-service registration only allows student role.
                 Teacher accounts require administrator setup. -->
            <div class="field">
              <label>Role</label>
              <div class="role-display">Student</div>
            </div>
          </template>

          <div class="field">
            <label>Password</label>
            <input
              :value="password"
              type="password"
              :autocomplete="isLogin ? 'current-password' : 'new-password'"
              required
              @input="onPasswordInput"
            />
          </div>

          <ul v-if="!isLogin" class="checklist">
            <li :class="{ ok: passwordRules.length }">At least 8 characters</li>
            <li :class="{ ok: passwordRules.hasLetter }">Contains a letter</li>
            <li :class="{ ok: passwordRules.hasDigit }">Contains a digit</li>
          </ul>

          <div v-if="error" class="auth-error">{{ error }}</div>

          <button class="btn btn-primary" type="submit" :disabled="loading">
            <span class="label">{{ loading ? 'Loading…' : title }}</span>
          </button>
        </form>

        <div class="auth-switch">
          <template v-if="isLogin">
            New here?
            <a href="#" @click.prevent="toggleMode">Create a student account</a>
          </template>
          <template v-else>
            Already have an account?
            <a href="#" @click.prevent="toggleMode">Log in</a>
          </template>
        </div>

        <p v-if="isLogin" class="demo-hint">
          Demo Account: <code>demo@mathdefense.local</code> / <code>Demo1234</code>
        </p>

        <div class="auth-foot">
          <button class="btn btn-ghost auth-block" @click="router.push('/')">
            ← Back to Menu
          </button>
        </div>
      </template>
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
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 48px 20px;
}

/* ── Card ── */
.card {
  background: rgba(220, 229, 237, 0.86);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.auth-card {
  max-width: 460px;
  width: 100%;
  margin: 0 auto;
}

/* ── Tabs ── */
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 18px;
}

.tab {
  padding: 10px 18px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 2px;
  color: var(--charcoal-soft);
  cursor: pointer;
  text-transform: uppercase;
}

.tab.active {
  color: var(--terracotta-deep);
  border-bottom-color: var(--terracotta);
  font-weight: 600;
}

/* ── Form fields ── */
.auth-form {
  display: flex;
  flex-direction: column;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 0.82rem;
  color: var(--charcoal-soft);
  margin-bottom: 6px;
  font-weight: 500;
}

.field input {
  width: 100%;
  padding: 12px 14px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  background: rgba(245, 250, 254, 0.85);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  color: var(--charcoal);
}

.field input:focus {
  outline: none;
  border-color: var(--terracotta);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(168, 188, 203, 0.28);
}

.role-display {
  width: 100%;
  padding: 12px 14px;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--charcoal-soft);
  font-size: 0.95rem;
}

/* ── Password checklist ── */
.checklist {
  list-style: none;
  margin: 6px 0 14px;
  padding: 0;
}

.checklist li {
  padding: 2px 0;
  font-size: 0.82rem;
  color: var(--charcoal-soft);
}

.checklist li::before {
  content: "○ ";
  color: var(--muted);
}

.checklist li.ok {
  color: var(--charcoal);
}

.checklist li.ok::before {
  content: "✓ ";
  color: var(--sage-deep);
  font-weight: 700;
}

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 10px 18px;
  min-height: 44px;
  border: 1px solid rgba(111, 138, 161, 0.4);
  border-radius: 10px;
  background: rgba(245, 250, 254, 0.78);
  color: var(--charcoal);
  cursor: pointer;
  letter-spacing: 0.4px;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
  text-transform: none;
}

.btn:hover {
  background: #fff;
  border-color: var(--terracotta);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(111, 138, 161, 0.24);
}

.btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn .label {
  flex: 0 0 auto;
}

.btn-primary {
  align-self: center;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  color: #fff;
  border: 1px solid var(--gold-deep);
  font-size: 1rem;
  letter-spacing: 1.2px;
  min-height: 50px;
  padding: 12px 22px;
  box-shadow: 0 8px 20px rgba(122, 113, 86, 0.36);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  margin-top: 4px;
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold) 100%);
  box-shadow: 0 12px 28px rgba(122, 113, 86, 0.44);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--charcoal-soft);
  font-size: 0.88rem;
  min-height: 38px;
  padding: 7px 14px;
}

.btn-ghost:hover {
  background: rgba(245, 250, 254, 0.6);
  color: var(--charcoal);
}

.auth-block {
  width: 100%;
}

/* ── Auxiliary text ── */
.auth-title {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--charcoal);
  letter-spacing: 4px;
  text-align: center;
  margin-bottom: 18px;
}

.mfa-hint {
  font-size: 0.85rem;
  color: var(--charcoal-soft);
  text-align: center;
  margin: 0 0 6px;
}

.auth-error {
  font-size: 0.85rem;
  color: var(--clay-deep);
  margin: 2px 0 8px;
}

.auth-notice {
  font-size: 0.85rem;
  color: var(--sage-deep);
  background: rgba(126, 144, 119, 0.12);
  border: 1px solid rgba(126, 144, 119, 0.35);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 16px;
  line-height: 1.45;
}

.auth-switch {
  text-align: center;
  margin: 14px 0;
  font-size: 0.85rem;
  color: var(--charcoal-soft);
}

.auth-switch a {
  color: var(--terracotta-deep);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.auth-switch a:hover {
  text-decoration: underline;
}

.demo-hint {
  text-align: center;
  font-size: 0.78rem;
  color: var(--muted);
  margin: 0 0 14px;
}

.demo-hint code {
  font-family: var(--font-mono);
  color: var(--terracotta-deep);
}

.auth-foot {
  border-top: 1px dashed var(--line-strong);
  padding-top: 14px;
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
