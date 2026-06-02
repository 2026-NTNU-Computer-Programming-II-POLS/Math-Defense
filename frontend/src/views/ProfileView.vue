<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore, type EndpointHitFxStyle } from '@/stores/uiStore'
import { authService } from '@/services/authService'
import { achievementService, type AchievementSummary } from '@/services/achievementService'
import { talentService, type TalentTreeOut } from '@/services/talentService'
import { useUiAudio } from '@/composables/useUiAudio'
import { useProfileInitials, PROFILE_COLOR_CHOICES } from '@/composables/useProfileInitials'

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

const { initials: profileInitials, setInitials, clearInitials } = useProfileInitials()
const initialsDraftLetters = ref(profileInitials.value?.letters ?? '')
const initialsDraftColor = ref(profileInitials.value?.color ?? PROFILE_COLOR_CHOICES[0].color)


const displayInitials = computed(() => {
  const letters = initialsDraftLetters.value.trim().slice(0, 2).toUpperCase()
  if (letters.length > 0) return { letters, color: initialsDraftColor.value }
  return profileInitials.value
})

const initialsError = ref('')

async function applyInitials(): Promise<void> {
  const trimmed = initialsDraftLetters.value.trim()
  if (trimmed.length === 0) return
  initialsError.value = ''
  try {
    await setInitials(trimmed, initialsDraftColor.value)
  } catch (e) {
    initialsError.value = e instanceof Error ? e.message : 'Failed to update avatar'
  }
}

async function clearAvatar(): Promise<void> {
  initialsError.value = ''
  try {
    await clearInitials()
  } catch (e) {
    initialsError.value = e instanceof Error ? e.message : 'Failed to clear avatar'
  }
}

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
  if (endpointMarkerSyncTimer !== null) {
    clearTimeout(endpointMarkerSyncTimer)
    endpointMarkerSyncTimer = null
  }
  if (endpointMarkerSyncInFlight) {
    endpointMarkerSyncInFlight.abort()
    endpointMarkerSyncInFlight = null
  }
})

// Endpoint marker — custom image upload. The uploaded file is resized to a
// 256×256 letterboxed dataURL so localStorage keeps headroom for other
// mdf.* prefs and the canvas draw stays cheap regardless of source size.
const ENDPOINT_MARKER_RESIZE_PX = 256
const ENDPOINT_MARKER_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ENDPOINT_MARKER_MAX_UPLOAD_MB = ENDPOINT_MARKER_MAX_UPLOAD_BYTES / (1024 * 1024)
// JPG/PNG only — keep formats predictable for canvas decode + avoid SVG
// XSS via foreignObject, animated GIFs that would look broken statically,
// and WebP which Safari decoded inconsistently across past versions.
const ENDPOINT_MARKER_ALLOWED_MIME: ReadonlyArray<string> = ['image/jpeg', 'image/png']
const ENDPOINT_MARKER_ALLOWED_EXT: ReadonlyArray<string> = ['.jpg', '.jpeg', '.png']
const endpointMarkerUploadError = ref('')

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ENDPOINT_MARKER_ALLOWED_EXT.some((ext) => lower.endsWith(ext))
}

async function onEndpointMarkerFileChange(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset the input so re-selecting the same file fires `change` again.
  input.value = ''
  if (!file) return
  endpointMarkerUploadError.value = ''
  // Reject by MIME + extension. Browsers occasionally report
  // `application/octet-stream` for valid jpg/png from older OS file pickers,
  // so the extension check is the belt-and-suspenders fallback.
  const mimeOk = ENDPOINT_MARKER_ALLOWED_MIME.includes(file.type)
  const extOk = hasAllowedExtension(file.name)
  if (!mimeOk && !extOk) {
    endpointMarkerUploadError.value = 'Only JPG or PNG images are supported'
    return
  }
  if (file.size > ENDPOINT_MARKER_MAX_UPLOAD_BYTES) {
    endpointMarkerUploadError.value = `Image must be under ${ENDPOINT_MARKER_MAX_UPLOAD_MB} MB`
    return
  }
  try {
    const dataUrl = await resizeImageToDataUrl(file, ENDPOINT_MARKER_RESIZE_PX)
    ui.setEndpointMarkerCustomDataUrl(dataUrl)
    // Also push the new image to the server. We bypass the debounce here:
    // an upload is a deliberate single action, not a slider drag, so going
    // straight to the request avoids a wasted 350 ms.
    void pushEndpointMarkerToServer()
  } catch (e) {
    endpointMarkerUploadError.value = e instanceof Error ? e.message : 'Failed to load image'
  }
}

function clearEndpointMarkerCustom(): void {
  ui.setEndpointMarkerCustomDataUrl(null)
  endpointMarkerUploadError.value = ''
  void pushEndpointMarkerToServer()
}

// Server sync — fire after any of the three endpoint-marker fields change.
// The local store update is optimistic (UI reflects the change immediately);
// the PUT is best-effort. A network failure surfaces via the inline error
// slot but doesn't roll back the local choice — the value persists in
// localStorage and will reconcile on the next successful sync.
const ENDPOINT_MARKER_SYNC_DEBOUNCE_MS = 350
const endpointMarkerSyncError = ref('')
let endpointMarkerSyncTimer: ReturnType<typeof setTimeout> | null = null
let endpointMarkerSyncInFlight: AbortController | null = null

function queueEndpointMarkerSync(): void {
  if (endpointMarkerSyncTimer !== null) clearTimeout(endpointMarkerSyncTimer)
  endpointMarkerSyncTimer = setTimeout(() => {
    endpointMarkerSyncTimer = null
    void pushEndpointMarkerToServer()
  }, ENDPOINT_MARKER_SYNC_DEBOUNCE_MS)
}

async function pushEndpointMarkerToServer(): Promise<void> {
  // Only sync if the user is logged in; anonymous flows keep local-only.
  if (!auth.user) return
  if (endpointMarkerSyncInFlight) endpointMarkerSyncInFlight.abort()
  const controller = new AbortController()
  endpointMarkerSyncInFlight = controller
  try {
    await authService.updateEndpointMarker({
      style: ui.endpointMarkerStyle,
      custom_dataurl: ui.endpointMarkerStyle === 'custom'
        ? ui.endpointMarkerCustomDataUrl
        : null,
      hit_fx: ui.endpointHitFx,
    }, { signal: controller.signal })
    endpointMarkerSyncError.value = ''
  } catch (e) {
    if (controller.signal.aborted) return
    endpointMarkerSyncError.value = e instanceof Error
      ? `Could not save to server: ${e.message}`
      : 'Could not save to server'
  } finally {
    if (endpointMarkerSyncInFlight === controller) endpointMarkerSyncInFlight = null
  }
}

function onEndpointMarkerStyleChange(style: 'star' | 'gorilla' | 'custom'): void {
  ui.setEndpointMarkerStyle(style)
  queueEndpointMarkerSync()
}

function onEndpointHitFxChange(fx: EndpointHitFxStyle): void {
  ui.setEndpointHitFx(fx)
  queueEndpointMarkerSync()
}

async function resizeImageToDataUrl(file: File, size: number): Promise<string> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not decode image'))
      el.src = sourceUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    // Letterbox-fit: preserve aspect, transparent padding.
    const scale = Math.min(size / img.width, size / img.height)
    const drawW = img.width * scale
    const drawH = img.height * scale
    const dx = (size - drawW) / 2
    const dy = (size - drawH) / 2
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(img, dx, dy, drawW, drawH)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
</script>

<template>
  <div class="profile-view">
    <div class="profile-panel rune-panel">
      <h2 class="profile-title">Profile</h2>

      <div v-if="auth.user" class="avatar-section">
        <div
          v-if="displayInitials"
          class="avatar-current"
          :style="{ borderColor: displayInitials.color }"
          :aria-label="`Avatar: ${displayInitials.letters}`"
        >
          <span
            class="avatar-initials-fill"
            :style="{ background: displayInitials.color }"
            aria-hidden="true"
          ></span>
          <span
            class="avatar-initials-letter"
            :style="{ color: displayInitials.color }"
          >{{ displayInitials.letters }}</span>
        </div>
        <div class="initials-picker">
          <div class="initials-picker-row">
            <input
              v-model="initialsDraftLetters"
              class="rune-input initials-input"
              type="text"
              :maxlength="2"
              placeholder="AB"
              aria-label="Initials (up to 2 letters)"
              @keyup.enter="applyInitials"
            />
            <div class="initials-color-grid" role="radiogroup" aria-label="Avatar color">
              <button
                v-for="choice in PROFILE_COLOR_CHOICES"
                :key="choice.color"
                type="button"
                class="initials-color-swatch"
                :class="{ selected: initialsDraftColor === choice.color }"
                :style="{ background: choice.color }"
                :aria-label="choice.name"
                :aria-pressed="initialsDraftColor === choice.color"
                @click="initialsDraftColor = choice.color"
              />
            </div>
            <button
              type="button"
              class="btn initials-apply-btn"
              :disabled="initialsDraftLetters.trim().length === 0"
              @click="applyInitials"
            >
              Use
            </button>
            <button
              v-if="profileInitials"
              type="button"
              class="btn initials-clear-btn"
              @click="clearAvatar"
            >
              Clear
            </button>
          </div>
        </div>

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
      <div
        v-else-if="achievementSummary && talentSummary"
        class="progression-line"
      >
        {{ achievementSummary.unlocked }}/{{ achievementSummary.total }} achievements
        ·
        {{ talentSummary.points_available }} talent points available
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

      <div class="settings-section">
        <h3 class="section-title">Endpoint Marker</h3>
        <p class="endpoint-marker-help">
          The marker drawn at the curves' common intersection (P*) — the
          enemy goal in each level.
        </p>
        <div class="marker-style-row">
          <label class="marker-radio">
            <input
              type="radio"
              :value="'star'"
              :checked="ui.endpointMarkerStyle === 'star'"
              name="endpoint-marker-style"
              @change="onEndpointMarkerStyleChange('star')"
            />
            <span class="marker-radio-label">⭐ Star <span class="marker-radio-default">(default)</span></span>
          </label>
          <label class="marker-radio">
            <input
              type="radio"
              :value="'gorilla'"
              :checked="ui.endpointMarkerStyle === 'gorilla'"
              name="endpoint-marker-style"
              @change="onEndpointMarkerStyleChange('gorilla')"
            />
            <span class="marker-radio-label">🦍 Gorilla</span>
          </label>
          <label class="marker-radio">
            <input
              type="radio"
              :value="'custom'"
              :checked="ui.endpointMarkerStyle === 'custom'"
              name="endpoint-marker-style"
              @change="onEndpointMarkerStyleChange('custom')"
            />
            <span class="marker-radio-label">Custom image</span>
          </label>
        </div>
        <div v-if="ui.endpointMarkerStyle === 'custom'" class="marker-custom-row">
          <div class="marker-custom-preview">
            <img
              v-if="ui.endpointMarkerCustomDataUrl"
              :src="ui.endpointMarkerCustomDataUrl"
              alt="Custom marker"
            />
            <span v-else class="marker-custom-empty">No image</span>
          </div>
          <div class="marker-custom-actions">
            <label class="btn marker-upload-btn">
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                class="marker-upload-input"
                @change="onEndpointMarkerFileChange"
              />
              {{ ui.endpointMarkerCustomDataUrl ? 'Replace image' : 'Upload image' }}
            </label>
            <button
              v-if="ui.endpointMarkerCustomDataUrl"
              type="button"
              class="btn marker-clear-btn"
              @click="clearEndpointMarkerCustom"
            >
              Clear
            </button>
          </div>
          <p class="marker-upload-hint">
            JPG or PNG · source up to {{ ENDPOINT_MARKER_MAX_UPLOAD_MB }} MB ·
            resized to {{ ENDPOINT_MARKER_RESIZE_PX }}×{{ ENDPOINT_MARKER_RESIZE_PX }}
            (processed image must compress under 3 MB)
          </p>
          <p v-if="endpointMarkerUploadError" class="marker-upload-error">
            {{ endpointMarkerUploadError }}
          </p>
        </div>
        <label class="settings-row volume-row">
          <span class="settings-label volume-label">Hit effect</span>
          <select
            class="settings-range marker-fx-select"
            :value="ui.endpointHitFx"
            @change="onEndpointHitFxChange(($event.target as HTMLSelectElement).value as EndpointHitFxStyle)"
          >
            <option value="fragments">Fragments (default)</option>
            <option value="crying">Crying</option>
            <option value="angry">Angry</option>
            <option value="random">Random</option>
          </select>
        </label>
        <p v-if="endpointMarkerSyncError" class="marker-upload-error">
          {{ endpointMarkerSyncError }}
        </p>
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
  width: 560px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.profile-title {
  font-size: var(--text-lg);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  text-align: center;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* ── Custom-initials avatar ──
   Coloured outer ring + smaller translucent inner disc + coloured letter.
   borderColor, the fill `background`, and the letter `color` are bound
   inline from data so the seven tower-defs colors stay the single source
   of truth. */
.avatar-current {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-style: solid;
  border-width: 2px;
  overflow: hidden;
}

.avatar-initials-fill {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  opacity: 0.2;
}

.avatar-initials-letter {
  position: relative;
  z-index: 1;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--text-md);
  letter-spacing: 1px;
}

.initials-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
}

.initials-picker-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.initials-input {
  width: 64px;
  text-align: center;
  text-transform: uppercase;
  font-family: var(--font-mono);
  letter-spacing: 2px;
  font-size: var(--text-sm);
  padding: 4px 6px;
  height: 30px;
}

.initials-color-grid {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.initials-color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--line);
  padding: 0;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
}

.initials-color-swatch:hover { transform: scale(1.08); }

.initials-color-swatch.selected {
  border-color: var(--charcoal);
  box-shadow: 0 0 0 2px var(--gold-tint-soft);
}

.initials-apply-btn,
.initials-clear-btn {
  font-size: var(--text-xs);
  padding: 2px 10px;
  height: 30px;
  min-height: 30px;
  letter-spacing: 0.5px;
}

.initials-apply-btn {
  border-color: var(--gold-deep);
  color: #fff;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
}
.initials-apply-btn:hover:not(:disabled) { filter: brightness(1.06); }

.initials-clear-btn {
  border-color: var(--line);
  color: var(--charcoal-soft);
}
.initials-clear-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

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

.profile-label { color: var(--charcoal-soft); }
.profile-value { color: var(--charcoal); font-weight: 600; }

.name-value { display: flex; align-items: center; gap: 6px; }

.name-edit-btn {
  background: none;
  border: none;
  color: var(--charcoal-soft);
  opacity: 0.6;
  cursor: pointer;
  font-size: var(--text-xs);
  padding: 0;
  line-height: 1;
}

.name-edit-btn:hover { opacity: 1; color: var(--terracotta-deep); }

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

.name-save-btn { border-color: var(--gold-deep); color: #fff; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%); }
.name-save-btn:hover { filter: brightness(1.06); }
.name-cancel-btn { border-color: var(--line); color: var(--charcoal-soft); }
.name-cancel-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.name-error { font-size: var(--text-xs); color: var(--clay-deep); }

.progression-loading { font-size: var(--text-xs); color: var(--charcoal-soft); text-align: center; }
.progression-error { font-size: var(--text-xs); color: var(--clay-deep); text-align: center; }

.progression-line {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  text-align: center;
  font-family: var(--font-mono);
  letter-spacing: 1px;
}

.pw-section { display: flex; flex-direction: column; }

.pw-toggle-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--line);
  color: var(--charcoal-soft);
  align-self: flex-start;
}

.pw-toggle-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.pw-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); letter-spacing: 1px; text-transform: uppercase; margin: 0; }

.settings-section { display: flex; flex-direction: column; gap: 8px; }
.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--text-primary);
  cursor: pointer;
}
.settings-checkbox { accent-color: var(--terracotta); cursor: pointer; }
.settings-label { color: var(--charcoal); }
.settings-row--with-hint { align-items: flex-start; }
.settings-row--with-hint .settings-checkbox { margin-top: 2px; }
.settings-label--block { display: flex; flex-direction: column; gap: 2px; }
.settings-hint {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  opacity: 0.85;
  line-height: 1.4;
  font-style: italic;
}

.volume-row { gap: 12px; }
.volume-label { flex-shrink: 0; }
.settings-range {
  flex: 1;
  accent-color: var(--terracotta);
  cursor: pointer;
}
.settings-range:disabled { opacity: 0.4; cursor: not-allowed; }
.volume-pct {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
  min-width: 36px;
  text-align: right;
}

.pw-error { font-size: var(--text-xs); color: var(--clay-deep); }
.pw-success { font-size: var(--text-xs); color: var(--sage-deep); }

.pw-actions { display: flex; gap: 8px; }

.pw-save-btn { font-size: var(--text-xs); border-color: var(--gold-deep); color: #fff; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%); }
.pw-save-btn:hover:not(:disabled) { filter: brightness(1.06); }
.pw-cancel-btn { font-size: var(--text-xs); border-color: var(--line); color: var(--charcoal-soft); }
.pw-cancel-btn:hover:not(:disabled) { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--line);
  color: var(--charcoal-soft);
}

.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

/* ── Endpoint marker settings ── */
.endpoint-marker-help {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  line-height: var(--leading-normal);
  margin: 0;
}
.marker-style-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
}
.marker-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--charcoal);
}
.marker-radio input {
  accent-color: var(--terracotta);
  cursor: pointer;
}
.marker-radio-label { display: inline-flex; align-items: center; gap: 4px; }
.marker-radio-default {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
}
.marker-custom-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  background: rgba(245, 250, 254, 0.6);
}
.marker-custom-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  align-self: flex-start;
}
.marker-custom-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.marker-custom-empty {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
}
.marker-custom-actions { display: flex; gap: 8px; }
.marker-upload-btn {
  position: relative;
  font-size: var(--text-xs);
  overflow: hidden;
}
.marker-upload-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.marker-clear-btn {
  font-size: var(--text-xs);
  border-color: var(--line);
  color: var(--charcoal-soft);
}
.marker-clear-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }
.marker-upload-error { font-size: var(--text-xs); color: var(--clay-deep); margin: 0; }
.marker-upload-hint {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
  margin: 0;
}
.marker-fx-select {
  flex: 1;
  font-size: var(--text-sm);
  font-family: var(--font-main);
  padding: 6px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: rgba(245, 250, 254, 0.85);
  color: var(--charcoal);
  cursor: pointer;
}
</style>
