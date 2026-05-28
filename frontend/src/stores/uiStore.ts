/**
 * uiStore — UI state Pinia Store
 * Manages panel visibility, selected tower, and other UI-only state.
 */
import { defineStore } from 'pinia'
import { ref, watch, onScopeDispose } from 'vue'
import { appBus } from '@/lib/app-bus'
import type { TowerType, EnemyType } from '@/data/constants'
import type { TowerCategory } from '@/data/tower-defs'

// UI-side category filter for TowerBar. 'all' is the bar's own
// show-everything sentinel; the rest mirror data/tower-defs `TowerCategory`.
export type TowerBarCategory = 'all' | TowerCategory

const PRINCIPLE_OVERLAY_PREF_KEY = 'mdf.principleOverlayEnabled'
const AUDIO_MUTED_PREF_KEY = 'mdf.audioMuted'
const AUDIO_VOLUME_PREF_KEY = 'mdf.audioVolume'
const AUDIO_VOLUME_MUSIC_KEY = 'mdf.audioVolume.music'
const AUDIO_VOLUME_SFX_KEY = 'mdf.audioVolume.sfx'
const AUDIO_VOLUME_UI_KEY = 'mdf.audioVolume.ui'
const SLIDER_FALLBACK_PREF_KEY = 'mdf.sliderFallbackEnabled'
const SEEN_COUNTER_ENEMIES_PREF_KEY = 'mdf.seenCounterEnemies'
// Pre-existing key set by TowerBar before this pref lived in uiStore — kept
// verbatim so existing players don't lose their saved filter on upgrade.
const TOWER_BAR_CATEGORY_PREF_KEY = 'mg.towerBar.category'

function loadPrincipleOverlayPref(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(PRINCIPLE_OVERLAY_PREF_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function loadAudioMutedPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(AUDIO_MUTED_PREF_KEY) === '1'
  } catch {
    return false
  }
}

function loadSliderFallbackPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SLIDER_FALLBACK_PREF_KEY) === '1'
  } catch {
    return false
  }
}

function loadAudioVolumePref(): number {
  if (typeof window === 'undefined') return 0.7
  try {
    const raw = window.localStorage.getItem(AUDIO_VOLUME_PREF_KEY)
    if (raw === null) return 0.7
    const n = Number(raw)
    if (!Number.isFinite(n)) return 0.7
    return Math.max(0, Math.min(1, n))
  } catch {
    return 0.7
  }
}

function loadBusVolumePref(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.max(0, Math.min(1, n))
  } catch {
    return fallback
  }
}

function loadTowerBarCategoryPref(): TowerBarCategory {
  if (typeof window === 'undefined') return 'all'
  try {
    const raw = window.localStorage.getItem(TOWER_BAR_CATEGORY_PREF_KEY)
    if (
      raw === 'all' || raw === 'geometry' || raw === 'functions'
      || raw === 'algebra' || raw === 'calculus'
    ) return raw
  } catch { /* localStorage unavailable (private mode); fall through */ }
  return 'all'
}

function loadSeenCounterEnemies(): Set<EnemyType> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(SEEN_COUNTER_ENEMIES_PREF_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is EnemyType => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof (value as { then: unknown }).then === 'function'
  )
}

export const useUiStore = defineStore('ui', () => {
  onScopeDispose(appBus.on('auth:logout', () => {
    if (modalVisible.value) dismissModal()
  }))

  // currently selected tower type (tower bar selection)
  const selectedTowerType = ref<TowerType | null>(null)

  // Build Panel (parameter configuration panel)
  const buildPanelVisible = ref(false)
  const buildPanelTowerId = ref<string | null>(null)  // shown after clicking a placed tower
  // Tower type behind the open build panel. selectedTowerType is cleared the
  // moment a tower is placed (so the next cell click doesn't place again), but
  // the matching tower-bar button should stay highlighted until the build
  // panel closes — this ref drives that highlight.
  const buildPanelTowerType = ref<TowerType | null>(null)

  // Buff Card Panel
  const buffPanelVisible = ref(false)

  // Modal (replaces alert/confirm)
  const modalVisible = ref(false)
  const modalTitle = ref('')
  const modalMessage = ref('')
  // Callback may return a Promise; we await it for rejection-reporting below.
  const modalCallback = ref<(() => unknown) | null>(null)
  // Sticky modals survive re-entrant side-effects (e.g. a 401-triggered logout
  // must not silently dismiss a "Sync Failed" modal the user hasn't read yet).
  const modalSticky = ref(false)
  // F-BUG-19: confirm-mode shows a Cancel button alongside OK. modalConfirmResolver
  // is a single-shot promise resolver wired up by showConfirm() and consumed
  // by closeModal()/cancelModal().
  const modalConfirmMode = ref(false)
  const modalConfirmLabel = ref('OK')
  const modalCancelLabel = ref('Cancel')
  let modalConfirmResolver: ((ok: boolean) => void) | null = null

  // Tutorial
  const tutorialVisible = ref(false)
  const tutorialStep = ref(0)

  // HUD hint
  const buildHintStep = ref(0)   // 0=select tower  1=click cell  2=set params  3=Cast Spell

  // Pedagogy: post-wave principle-surfacing overlay (Backlog item #1).
  // Persisted to localStorage so the player's choice survives reloads.
  const principleOverlayEnabled = ref<boolean>(loadPrincipleOverlayPref())
  if (typeof window !== 'undefined') {
    watch(principleOverlayEnabled, (v) => {
      try { window.localStorage.setItem(PRINCIPLE_OVERLAY_PREF_KEY, v ? '1' : '0') }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
  }

  function setPrincipleOverlayEnabled(v: boolean): void {
    principleOverlayEnabled.value = v
  }

  // Pedagogical Backlog §15.3 — master volume + mute persisted across sessions.
  // useGameLoop bridges these refs into AssetManager so the audio engine
  // never imports Pinia (preserves engine/UI separation).
  const audioMuted = ref<boolean>(loadAudioMutedPref())
  const audioVolume = ref<number>(loadAudioVolumePref())
  // Per-bus volumes (music / sfx / ui). Master `audioVolume` still gates all
  // playback for legacy uses; bus knobs let the player rebalance music vs.
  // gameplay vs. UI clicks. Defaults: music 0.7, sfx 1.0, ui 0.8.
  const audioVolumeMusic = ref<number>(loadBusVolumePref(AUDIO_VOLUME_MUSIC_KEY, 0.7))
  const audioVolumeSfx = ref<number>(loadBusVolumePref(AUDIO_VOLUME_SFX_KEY, 1.0))
  const audioVolumeUi = ref<number>(loadBusVolumePref(AUDIO_VOLUME_UI_KEY, 0.8))
  if (typeof window !== 'undefined') {
    watch(audioMuted, (v) => {
      try { window.localStorage.setItem(AUDIO_MUTED_PREF_KEY, v ? '1' : '0') }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
    watch(audioVolume, (v) => {
      try { window.localStorage.setItem(AUDIO_VOLUME_PREF_KEY, String(v)) }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
    watch(audioVolumeMusic, (v) => {
      try { window.localStorage.setItem(AUDIO_VOLUME_MUSIC_KEY, String(v)) }
      catch { /* ignore */ }
    })
    watch(audioVolumeSfx, (v) => {
      try { window.localStorage.setItem(AUDIO_VOLUME_SFX_KEY, String(v)) }
      catch { /* ignore */ }
    })
    watch(audioVolumeUi, (v) => {
      try { window.localStorage.setItem(AUDIO_VOLUME_UI_KEY, String(v)) }
      catch { /* ignore */ }
    })
  }

  function setAudioVolume(v: number): void {
    audioVolume.value = Math.max(0, Math.min(1, v))
  }
  function setAudioVolumeMusic(v: number): void {
    audioVolumeMusic.value = Math.max(0, Math.min(1, v))
  }
  function setAudioVolumeSfx(v: number): void {
    audioVolumeSfx.value = Math.max(0, Math.min(1, v))
  }
  function setAudioVolumeUi(v: number): void {
    audioVolumeUi.value = Math.max(0, Math.min(1, v))
  }

  // Pedagogical Backlog §20 — opt-in slider-fallback / practice mode for
  // dyscalculic / high-anxiety learners. When true, MagicModePanel and
  // MatrixInputPanel render slider controls instead of typed expression /
  // coefficient input, AND every new session is flagged practice_mode so it
  // is excluded from the global leaderboard. Persisted across sessions.
  const sliderFallbackEnabled = ref<boolean>(loadSliderFallbackPref())
  if (typeof window !== 'undefined') {
    watch(sliderFallbackEnabled, (v) => {
      try { window.localStorage.setItem(SLIDER_FALLBACK_PREF_KEY, v ? '1' : '0') }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
  }

  function setSliderFallbackEnabled(v: boolean): void {
    sliderFallbackEnabled.value = v
  }

  // TowerBar's category filter ('all' | math discipline). Persisted so the
  // player's last narrowing survives reloads and run boundaries.
  const towerBarCategory = ref<TowerBarCategory>(loadTowerBarCategoryPref())
  if (typeof window !== 'undefined') {
    watch(towerBarCategory, (v) => {
      try { window.localStorage.setItem(TOWER_BAR_CATEGORY_PREF_KEY, v) }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
  }

  function setTowerBarCategory(c: TowerBarCategory): void {
    towerBarCategory.value = c
  }

  // V3 Phase 6 — first-encounter telegraph. Persisted to localStorage so
  // "first encounter" means the first time ever, across sessions, not just
  // the first time this run.
  const seenCounterEnemies = ref<Set<EnemyType>>(loadSeenCounterEnemies())
  if (typeof window !== 'undefined') {
    watch(seenCounterEnemies, (v) => {
      try { window.localStorage.setItem(SEEN_COUNTER_ENEMIES_PREF_KEY, JSON.stringify([...v])) }
      catch { /* storage may be disabled (private mode); silently ignore */ }
    })
  }

  function markCounterEnemySeen(type: EnemyType): void {
    if (seenCounterEnemies.value.has(type)) return
    // Reassign rather than mutate so the persistence watcher fires and any
    // computed consumers re-evaluate.
    const next = new Set(seenCounterEnemies.value)
    next.add(type)
    seenCounterEnemies.value = next
  }

  function hasSeenCounterEnemy(type: EnemyType): boolean {
    return seenCounterEnemies.value.has(type)
  }

  // Piecewise paths Phase 5: Function Panel ↔ Renderer hover sync.
  // Panel writes via `setHoveredSegmentId`; `useEngineUiBridges` mirrors the
  // value onto `game.hud.hoveredSegmentId` so the Renderer (engine layer)
  // reads it without pulling in Pinia.
  const hoveredSegmentId = ref<string | null>(null)

  function showModal(
    title: string,
    message: string,
    onClose?: () => unknown,
    opts: { sticky?: boolean } = {},
  ): void {
    // If a confirm is already open, resolve its pending promise as cancelled
    // before replacing the slot — otherwise the awaiting caller would hang.
    if (modalConfirmResolver) {
      const prev = modalConfirmResolver
      modalConfirmResolver = null
      prev(false)
    }
    modalConfirmMode.value = false
    modalTitle.value = title
    modalMessage.value = message
    modalCallback.value = onClose ?? null
    modalSticky.value = opts.sticky ?? false
    modalVisible.value = true
  }

  function dismissModal(opts: { force?: boolean } = {}): void {
    // Callers that just want to clear side-effects (e.g. logout) respect the
    // sticky flag; only explicit user action or force=true closes a sticky modal.
    if (modalSticky.value && !opts.force) return
    modalCallback.value = null
    modalSticky.value = false
    modalVisible.value = false
    if (modalConfirmResolver) {
      const resolve = modalConfirmResolver
      modalConfirmResolver = null
      modalConfirmMode.value = false
      resolve(false)
    }
  }

  // F-BUG-19: replaces native confirm(). Returns true on OK, false on Cancel
  // / Esc / overlay click. Routing through the modal system gives us
  // consistent styling, focus trapping, and avoids the synchronous-blocking
  // behavior of window.confirm.
  function showConfirm(
    title: string,
    message: string,
    opts: { confirmLabel?: string; cancelLabel?: string } = {},
  ): Promise<boolean> {
    // If a previous confirm is still open, resolve it as cancelled so the
    // pending caller doesn't hang forever.
    if (modalConfirmResolver) {
      const prev = modalConfirmResolver
      modalConfirmResolver = null
      prev(false)
    }
    modalTitle.value = title
    modalMessage.value = message
    modalCallback.value = null
    modalSticky.value = false
    modalConfirmMode.value = true
    modalConfirmLabel.value = opts.confirmLabel ?? 'OK'
    modalCancelLabel.value = opts.cancelLabel ?? 'Cancel'
    modalVisible.value = true
    return new Promise<boolean>((resolve) => {
      modalConfirmResolver = resolve
    })
  }

  function _showErrorFallback(): void {
    modalTitle.value = 'Error'
    modalMessage.value = 'The operation could not be completed. Please try again.'
    modalCallback.value = null
    modalSticky.value = false
    modalConfirmMode.value = false
    modalConfirmResolver = null
    modalVisible.value = true
  }

  function closeModal(): void {
    const cb = modalCallback.value
    const resolver = modalConfirmResolver
    const wasConfirm = modalConfirmMode.value
    // Clear state first so that if cb throws / rejects we open a fresh error
    // modal on top of a cleared slot instead of re-opening on top of itself.
    modalCallback.value = null
    modalSticky.value = false
    modalConfirmMode.value = false
    modalConfirmResolver = null
    modalVisible.value = false
    if (resolver) resolver(true)
    if (wasConfirm) return
    if (!cb) return
    try {
      const result = cb()
      // Catch async rejections too (e.g. router.push returning a rejected
      // Promise) — otherwise the user sees the modal disappear but never
      // finds out the action actually failed.
      if (isPromiseLike(result)) {
        result.then(undefined, (e) => {
          console.error('[Modal] Async callback error:', e)
          _showErrorFallback()
        })
      }
    } catch (e) {
      console.error('[Modal] Callback error:', e)
      _showErrorFallback()
    }
  }

  function selectTower(type: TowerType | null): void {
    selectedTowerType.value = type
    buildHintStep.value = type ? 1 : 0
  }

  function clearSelectedTower(): void {
    selectedTowerType.value = null
  }

  function openBuildPanel(towerId: string, towerType: TowerType | null = null): void {
    buildPanelTowerId.value = towerId
    buildPanelTowerType.value = towerType
    buildPanelVisible.value = true
  }

  function closeBuildPanel(): void {
    buildPanelVisible.value = false
    buildPanelTowerId.value = null
    buildPanelTowerType.value = null
  }

  function hideBuildPanel(): void {
    buildPanelVisible.value = false
    buildPanelTowerType.value = null
  }

  function setBuildHintStep(step: number): void {
    buildHintStep.value = step
  }

  function setHoveredSegmentId(id: string | null): void {
    hoveredSegmentId.value = id
  }

  return {
    selectedTowerType,
    buildPanelVisible, buildPanelTowerId, buildPanelTowerType,
    buffPanelVisible,
    modalVisible, modalTitle, modalMessage, modalCallback,
    modalConfirmMode, modalConfirmLabel, modalCancelLabel,
    tutorialVisible, tutorialStep,
    buildHintStep,
    hoveredSegmentId,
    principleOverlayEnabled,
    audioMuted, audioVolume,
    audioVolumeMusic, audioVolumeSfx, audioVolumeUi,
    sliderFallbackEnabled,
    towerBarCategory,
    seenCounterEnemies,
    showModal, showConfirm, closeModal, dismissModal, selectTower,
    clearSelectedTower, openBuildPanel, closeBuildPanel, hideBuildPanel,
    setBuildHintStep,
    setHoveredSegmentId,
    setPrincipleOverlayEnabled,
    setAudioVolume,
    setAudioVolumeMusic, setAudioVolumeSfx, setAudioVolumeUi,
    setSliderFallbackEnabled,
    setTowerBarCategory,
    markCounterEnemySeen, hasSeenCounterEnemy,
  }
})
