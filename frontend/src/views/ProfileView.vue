<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { authService } from '@/services/authService'
import { achievementService, type AchievementSummary } from '@/services/achievementService'
import { talentService, type TalentTreeOut } from '@/services/talentService'
import { useUiAudio } from '@/composables/useUiAudio'

const uiAudio = useUiAudio()

// Audio settings test-sound — plays a short ui-confirm so the player can
// audition the current mix without leaving the settings panel.
function playTestSound(): void {
  uiAudio.confirm()
}

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
}

const PRESET_AVATARS = [
  '/avatars/wizard.svg',
  '/avatars/knight.svg',
  '/avatars/archer.svg',
  '/avatars/mage.svg',
  '/avatars/scholar.svg',
  '/avatars/alchemist.svg',
]

const pwVisible = ref(false)
const pwCurrent = ref('')
const pwNew = ref('')
const pwConfirm = ref('')
const pwChanging = ref(false)
const pwError = ref('')
const pwSuccess = ref(false)
let pwSuccessTimer: ReturnType<typeof setTimeout> | null = null

async function changePassword(): Promise<void> {
  if (!pwCurrent.value || !pwNew.value || !pwConfirm.value) {
    pwError.value = 'Please fill all fields'
    return
  }
  if (pwNew.value !== pwConfirm.value) {
    pwError.value = 'New passwords do not match'
    return
  }
  if (pwNew.value.length < 8) {
    pwError.value = 'New password must be at least 8 characters'
    return
  }
  if (!/[a-zA-Z]/.test(pwNew.value) || !/[0-9]/.test(pwNew.value)) {
    pwError.value = 'New password must contain a letter and a digit'
    return
  }
  pwChanging.value = true
  pwError.value = ''
  pwSuccess.value = false
  try {
    await authService.changePassword(pwCurrent.value, pwNew.value)
    pwSuccess.value = true
    pwCurrent.value = ''
    pwNew.value = ''
    pwConfirm.value = ''
    if (pwSuccessTimer !== null) clearTimeout(pwSuccessTimer)
    pwSuccessTimer = setTimeout(() => {
      pwSuccess.value = false
      pwVisible.value = false
      pwSuccessTimer = null
    }, 2000)
  } catch (e) {
    pwError.value = e instanceof Error ? e.message : 'Failed to change password'
  } finally {
    pwChanging.value = false
  }
}

const achievementSummary = ref<AchievementSummary | null>(null)
const talentSummary = ref<TalentTreeOut | null>(null)
const loading = ref(true)
const loadError = ref('')
const avatarSaving = ref(false)
const avatarError = ref('')
const nameDraft = ref('')
const nameEditing = ref(false)
const nameSaving = ref(false)
const nameError = ref('')

onMounted(async () => {
  try {
    const [ach, tal] = await Promise.all([
      achievementService.summary(),
      talentService.getTree(),
    ])
    achievementSummary.value = ach
    talentSummary.value = tal
  } catch {
    loadError.value = 'Could not load progression data'
  } finally {
    loading.value = false
  }
})

function startNameEdit(): void {
  nameDraft.value = auth.user?.player_name ?? ''
  nameEditing.value = true
  nameError.value = ''
}

function cancelNameEdit(): void {
  nameEditing.value = false
  nameError.value = ''
}

async function savePlayerName(): Promise<void> {
  const trimmed = nameDraft.value.trim()
  if (!trimmed || trimmed.length > 50) {
    nameError.value = 'Name must be 1-50 characters'
    return
  }
  nameSaving.value = true
  nameError.value = ''
  try {
    await auth.updatePlayerName(trimmed)
    nameEditing.value = false
  } catch {
    nameError.value = 'Failed to save name'
  } finally {
    nameSaving.value = false
  }
}

onBeforeUnmount(() => {
  if (pwSuccessTimer !== null) {
    clearTimeout(pwSuccessTimer)
    pwSuccessTimer = null
  }
})

// M12: mirror the backend allowlist client-side. Any avatar_url that doesn't
// start with '/avatars/' is silently replaced with the default so a future
// backend regression can't load an arbitrary URL.
const safeAvatarUrl = computed(() => {
  const url = auth.user?.avatar_url ?? null
  if (url && url.startsWith('/avatars/')) return url
  return PRESET_AVATARS[0]
})

async function selectAvatar(url: string): Promise<void> {
  if (!auth.user || auth.user.avatar_url === url) return
  avatarSaving.value = true
  avatarError.value = ''
  try {
    await auth.updateAvatar(url)
  } catch {
    avatarError.value = 'Failed to save avatar'
  } finally {
    avatarSaving.value = false
  }
}
</script>

<template>
  <div class="profile-view">
    <div class="profile-panel rune-panel">
      <h2 class="profile-title">Profile</h2>

      <div v-if="auth.user" class="avatar-section">
        <img
          class="avatar-current"
          :src="safeAvatarUrl"
          alt="Avatar"
        />
        <div class="avatar-grid">
          <button
            v-for="url in PRESET_AVATARS"
            :key="url"
            class="avatar-btn"
            :class="{ selected: auth.user.avatar_url === url }"
            :disabled="avatarSaving"
            @click="selectAvatar(url)"
          >
            <img :src="url" :alt="url" />
          </button>
        </div>
        <div v-if="avatarError" class="avatar-error">{{ avatarError }}</div>
      </div>

      <div v-if="auth.user" class="profile-info">
        <div class="profile-row">
          <span class="profile-label">Player Name</span>
          <span v-if="!nameEditing" class="profile-value name-value">
            {{ auth.user.player_name }}
            <button class="name-edit-btn" @click="startNameEdit">✎</button>
          </span>
          <span v-else class="name-edit-inline">
            <input
              v-model="nameDraft"
              class="rune-input name-input"
              maxlength="50"
              :disabled="nameSaving"
              @keyup.enter="savePlayerName"
              @keyup.escape="cancelNameEdit"
            />
            <button class="btn name-save-btn" :disabled="nameSaving" @click="savePlayerName">✓</button>
            <button class="btn name-cancel-btn" :disabled="nameSaving" @click="cancelNameEdit">✕</button>
          </span>
        </div>
        <div v-if="nameError" class="name-error">{{ nameError }}</div>
        <div class="profile-row">
          <span class="profile-label">Email</span>
          <span class="profile-value">{{ auth.user.email }}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Role</span>
          <span class="profile-value">{{ roleLabels[auth.user.role] ?? auth.user.role }}</span>
        </div>
      </div>

      <div v-if="loading" class="progression-loading">Loading progression…</div>
      <div v-else-if="loadError" class="progression-error">{{ loadError }}</div>
      <div v-else class="progression-summary">
        <div v-if="achievementSummary" class="summary-card" @click="router.push('/achievements')">
          <div class="summary-title">Achievements</div>
          <div class="summary-stat">{{ achievementSummary.unlocked }} / {{ achievementSummary.total }}</div>
          <div class="summary-sub">{{ achievementSummary.talent_points_earned }} TP earned</div>
        </div>
        <div v-if="talentSummary" class="summary-card" @click="router.push('/talents')">
          <div class="summary-title">Talents</div>
          <div class="summary-stat">{{ talentSummary.points_available }} available</div>
          <div class="summary-sub">{{ talentSummary.points_spent }} / {{ talentSummary.points_earned }} spent</div>
        </div>
      </div>

      <div class="profile-links">
        <button class="btn link-btn" @click="router.push('/achievements')">View Achievements</button>
        <button class="btn link-btn" @click="router.push('/talents')">Talent Tree</button>
      </div>

      <div class="settings-section">
        <h3 class="section-title">Game Settings</h3>
        <label class="settings-row">
          <input
            v-model="ui.principleOverlayEnabled"
            type="checkbox"
            class="settings-checkbox"
          />
          <span class="settings-label">Show learning hints between waves</span>
        </label>
        <label class="settings-row settings-row--with-hint">
          <input
            v-model="ui.sliderFallbackEnabled"
            type="checkbox"
            class="settings-checkbox"
          />
          <span class="settings-label settings-label--block">
            Practice mode (slider fallback)
            <span class="settings-hint">
              Replace typed math input with sliders for accessibility.
              Runs are not eligible for the global leaderboard while enabled.
            </span>
          </span>
        </label>
        <label class="settings-row">
          <input
            v-model="ui.audioMuted"
            type="checkbox"
            class="settings-checkbox"
          />
          <span class="settings-label">Mute audio</span>
        </label>
        <label class="settings-row volume-row">
          <span class="settings-label volume-label">Master volume</span>
          <input
            :value="ui.audioVolume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="settings-range"
            :disabled="ui.audioMuted"
            @input="ui.setAudioVolume(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="volume-pct">{{ Math.round(ui.audioVolume * 100) }}%</span>
        </label>
        <label class="settings-row volume-row">
          <span class="settings-label volume-label">Music</span>
          <input
            :value="ui.audioVolumeMusic"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="settings-range"
            :disabled="ui.audioMuted"
            @input="ui.setAudioVolumeMusic(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="volume-pct">{{ Math.round(ui.audioVolumeMusic * 100) }}%</span>
        </label>
        <label class="settings-row volume-row">
          <span class="settings-label volume-label">Sound effects</span>
          <input
            :value="ui.audioVolumeSfx"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="settings-range"
            :disabled="ui.audioMuted"
            @input="ui.setAudioVolumeSfx(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="volume-pct">{{ Math.round(ui.audioVolumeSfx * 100) }}%</span>
        </label>
        <label class="settings-row volume-row">
          <span class="settings-label volume-label">UI clicks</span>
          <input
            :value="ui.audioVolumeUi"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="settings-range"
            :disabled="ui.audioMuted"
            @input="ui.setAudioVolumeUi(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="volume-pct">{{ Math.round(ui.audioVolumeUi * 100) }}%</span>
        </label>
        <div class="settings-row">
          <button class="btn test-sound-btn" type="button" :disabled="ui.audioMuted" @click="playTestSound">
            Test sound
          </button>
        </div>
      </div>

      <div class="pw-section">
        <button v-if="!pwVisible" class="btn pw-toggle-btn" @click="pwVisible = true">Change Password</button>
        <form v-else class="pw-form" @submit.prevent="changePassword">
          <h3 class="section-title">Change Password</h3>
          <input v-model="pwCurrent" class="rune-input" type="password" placeholder="Current password" :disabled="pwChanging" />
          <input v-model="pwNew" class="rune-input" type="password" placeholder="New password (min 8 chars, letter + digit)" :disabled="pwChanging" />
          <input v-model="pwConfirm" class="rune-input" type="password" placeholder="Confirm new password" :disabled="pwChanging" />
          <div v-if="pwError" class="pw-error">{{ pwError }}</div>
          <div v-if="pwSuccess" class="pw-success">Password changed!</div>
          <div class="pw-actions">
            <button class="btn pw-save-btn" type="submit" :disabled="pwChanging">{{ pwChanging ? 'Saving…' : 'Save' }}</button>
            <button class="btn pw-cancel-btn" type="button" :disabled="pwChanging" @click="pwVisible = false; pwError = ''">Cancel</button>
          </div>
        </form>
      </div>

      <button class="btn back-btn" @click="router.push('/')">Back to Menu</button>
    </div>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
}

.profile-panel {
  width: 420px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-title {
  font-size: var(--text-base);
  font-family: var(--font-mono);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 4px;
  text-align: center;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.avatar-current {
  width: 64px;
  height: 64px;
  border: 2px solid var(--gold);
  border-radius: 50%;
  object-fit: contain;
  background: var(--stone-dark);
  padding: 4px;
}

.avatar-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.avatar-btn {
  width: 44px;
  height: 44px;
  padding: 3px;
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s;
}

.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.avatar-btn:hover { border-color: var(--axis); }
.avatar-btn.selected { border-color: var(--gold); border-width: 2px; }
.avatar-btn:disabled { opacity: 0.5; cursor: default; }

.avatar-error { font-size: var(--text-xs); color: var(--error-red); }

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
}

.profile-label { color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; }
.profile-value { color: var(--gold); text-shadow: var(--gold-shadow); }

.name-value { display: flex; align-items: center; gap: 6px; }

.name-edit-btn {
  background: none;
  border: none;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  opacity: 0.5;
  cursor: pointer;
  font-size: var(--text-xs);
  padding: 0;
  line-height: 1;
}

.name-edit-btn:hover { opacity: 1; color: var(--gold); text-shadow: var(--gold-shadow); }

.name-edit-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.name-input {
  flex: 1;
  font-size: var(--text-xs);
  padding: 2px 6px;
  height: 24px;
}

.name-save-btn, .name-cancel-btn {
  font-size: var(--text-xs);
  padding: 2px 6px;
  height: 24px;
  min-width: 24px;
  letter-spacing: 0;
}

.name-save-btn { border-color: var(--gold); color: var(--gold); text-shadow: var(--gold-shadow); }
.name-save-btn:hover { background: var(--gold); color: var(--stone-dark); }
.name-cancel-btn { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.name-cancel-btn:hover { background: var(--axis); color: var(--stone-dark); }

.name-error { font-size: var(--text-xs); color: var(--error-red); }

.progression-loading { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.6; text-align: center; }
.progression-error { font-size: var(--text-xs); color: var(--enemy-red); text-align: center; }

.progression-summary {
  display: flex;
  gap: 12px;
}

.summary-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.summary-card:hover { border-color: var(--gold); }
.summary-title { font-size: var(--text-2xs); color: var(--axis); text-shadow: var(--gold-shadow); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
.summary-stat { font-size: var(--text-base); color: var(--gold); text-shadow: var(--gold-shadow); }
.summary-sub { font-size: var(--text-2xs); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; margin-top: 4px; }

.profile-links {
  display: flex;
  gap: 8px;
}

.link-btn {
  flex: 1;
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--gold);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
}

.link-btn:hover { background: var(--gold); color: var(--stone-dark); }

.pw-section { display: flex; flex-direction: column; }

.pw-toggle-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  align-self: flex-start;
}

.pw-toggle-btn:hover { background: var(--axis); color: var(--stone-dark); }

.pw-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title { font-size: var(--text-xs); color: var(--gold); text-shadow: var(--gold-shadow); margin: 0; }

.settings-section { display: flex; flex-direction: column; gap: 8px; }
.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--text-primary);
  cursor: pointer;
}
.settings-checkbox { accent-color: var(--gold); cursor: pointer; }
.settings-label { color: var(--text-primary); }
.settings-row--with-hint { align-items: flex-start; }
.settings-row--with-hint .settings-checkbox { margin-top: 2px; }
.settings-label--block { display: flex; flex-direction: column; gap: 2px; }
.settings-hint {
  font-size: var(--text-2xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  opacity: 0.75;
  line-height: 1.4;
  font-style: italic;
}

.volume-row { gap: 12px; }
.volume-label { flex-shrink: 0; }
.settings-range {
  flex: 1;
  accent-color: var(--gold);
  cursor: pointer;
}
.settings-range:disabled { opacity: 0.4; cursor: not-allowed; }
.volume-pct {
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  min-width: 36px;
  text-align: right;
}

.pw-error { font-size: var(--text-xs); color: var(--error-red); }
.pw-success { font-size: var(--text-xs); color: var(--gold); text-shadow: var(--gold-shadow); }

.pw-actions { display: flex; gap: 8px; }

.pw-save-btn { font-size: var(--text-xs); border-color: var(--gold); color: var(--gold); text-shadow: var(--gold-shadow); }
.pw-save-btn:hover:not(:disabled) { background: var(--gold); color: var(--stone-dark); }
.pw-cancel-btn { font-size: var(--text-xs); border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.pw-cancel-btn:hover:not(:disabled) { background: var(--axis); color: var(--stone-dark); }

.back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
