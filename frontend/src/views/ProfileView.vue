<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'
import { achievementService, type AchievementSummary } from '@/services/achievementService'
import { talentService, type TalentTreeOut } from '@/services/talentService'

const router = useRouter()
const auth = useAuthStore()

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
    setTimeout(() => { pwSuccess.value = false; pwVisible.value = false }, 2000)
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
          :src="auth.user.avatar_url ?? PRESET_AVATARS[0]"
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
}

.profile-panel {
  width: 420px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-title {
  font-size: 16px;
  color: var(--gold);
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
  border: 1px solid var(--grid-line);
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

.avatar-error { font-size: 10px; color: var(--error-red); }

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.profile-label { color: var(--axis); opacity: 0.7; }
.profile-value { color: var(--gold); }

.name-value { display: flex; align-items: center; gap: 6px; }

.name-edit-btn {
  background: none;
  border: none;
  color: var(--axis);
  opacity: 0.5;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  line-height: 1;
}

.name-edit-btn:hover { opacity: 1; color: var(--gold); }

.name-edit-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.name-input {
  flex: 1;
  font-size: 12px;
  padding: 2px 6px;
  height: 24px;
}

.name-save-btn, .name-cancel-btn {
  font-size: 10px;
  padding: 2px 6px;
  height: 24px;
  min-width: 24px;
  letter-spacing: 0;
}

.name-save-btn { border-color: var(--gold); color: var(--gold); }
.name-save-btn:hover { background: var(--gold); color: var(--stone-dark); }
.name-cancel-btn { border-color: var(--axis); color: var(--axis); }
.name-cancel-btn:hover { background: var(--axis); color: var(--stone-dark); }

.name-error { font-size: 10px; color: var(--error-red); }

.progression-loading { font-size: 11px; color: var(--axis); opacity: 0.6; text-align: center; }
.progression-error { font-size: 11px; color: var(--enemy-red); text-align: center; }

.progression-summary {
  display: flex;
  gap: 12px;
}

.summary-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.summary-card:hover { border-color: var(--gold); }
.summary-title { font-size: 10px; color: var(--axis); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
.summary-stat { font-size: 16px; color: var(--gold); }
.summary-sub { font-size: 10px; color: var(--axis); opacity: 0.7; margin-top: 4px; }

.profile-links {
  display: flex;
  gap: 8px;
}

.link-btn {
  flex: 1;
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--gold);
  color: var(--gold);
}

.link-btn:hover { background: var(--gold); color: var(--stone-dark); }

.pw-section { display: flex; flex-direction: column; }

.pw-toggle-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
  align-self: flex-start;
}

.pw-toggle-btn:hover { background: var(--axis); color: var(--stone-dark); }

.pw-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title { font-size: 12px; color: var(--gold); margin: 0; }

.pw-error { font-size: 10px; color: var(--error-red); }
.pw-success { font-size: 10px; color: var(--gold); }

.pw-actions { display: flex; gap: 8px; }

.pw-save-btn { font-size: 11px; border-color: var(--gold); color: var(--gold); }
.pw-save-btn:hover:not(:disabled) { background: var(--gold); color: var(--stone-dark); }
.pw-cancel-btn { font-size: 11px; border-color: var(--axis); color: var(--axis); }
.pw-cancel-btn:hover:not(:disabled) { background: var(--axis); color: var(--stone-dark); }

.back-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
