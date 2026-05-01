/**
 * uiStore — UI state Pinia Store
 * Manages panel visibility, selected tower, and other UI-only state.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TowerType } from '@/data/constants'

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof (value as { then: unknown }).then === 'function'
  )
}

export const useUiStore = defineStore('ui', () => {
  // currently selected tower type (tower bar selection)
  const selectedTowerType = ref<TowerType | null>(null)

  // Build Panel (parameter configuration panel)
  const buildPanelVisible = ref(false)
  const buildPanelTowerId = ref<string | null>(null)  // shown after clicking a placed tower

  // Buff Card Panel
  const buffPanelVisible = ref(false)

  // Modal (replaces alert)
  const modalVisible = ref(false)
  const modalTitle = ref('')
  const modalMessage = ref('')
  // Callback may return a Promise; we await it for rejection-reporting below.
  const modalCallback = ref<(() => unknown) | null>(null)
  // Sticky modals survive re-entrant side-effects (e.g. a 401-triggered logout
  // must not silently dismiss a "Sync Failed" modal the user hasn't read yet).
  const modalSticky = ref(false)

  // Tutorial
  const tutorialVisible = ref(false)
  const tutorialStep = ref(0)

  // HUD hint
  const buildHintStep = ref(0)   // 0=select tower  1=click cell  2=set params  3=Cast Spell

  // Piecewise paths Phase 5: Function Panel ↔ Renderer hover sync.
  // Panel writes via `setHoveredSegmentId`; `useGameLoop` mirrors the
  // value onto `game.hoveredSegmentId` so the Renderer (engine layer)
  // reads it without pulling in Pinia.
  const hoveredSegmentId = ref<string | null>(null)

  function showModal(
    title: string,
    message: string,
    onClose?: () => unknown,
    opts: { sticky?: boolean } = {},
  ): void {
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
  }

  function _showErrorFallback(): void {
    modalTitle.value = 'Error'
    modalMessage.value = 'The operation could not be completed. Please try again.'
    modalCallback.value = null
    modalVisible.value = true
  }

  function closeModal(): void {
    const cb = modalCallback.value
    // Clear state first so that if cb throws / rejects we open a fresh error
    // modal on top of a cleared slot instead of re-opening on top of itself.
    modalCallback.value = null
    modalSticky.value = false
    modalVisible.value = false
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

  function openBuildPanel(towerId: string): void {
    buildPanelTowerId.value = towerId
    buildPanelVisible.value = true
  }

  function closeBuildPanel(): void {
    buildPanelVisible.value = false
    buildPanelTowerId.value = null
  }

  function hideBuildPanel(): void {
    buildPanelVisible.value = false
  }

  function setBuildHintStep(step: number): void {
    buildHintStep.value = step
  }

  function setHoveredSegmentId(id: string | null): void {
    hoveredSegmentId.value = id
  }

  return {
    selectedTowerType,
    buildPanelVisible, buildPanelTowerId,
    buffPanelVisible,
    modalVisible, modalTitle, modalMessage, modalCallback,
    tutorialVisible, tutorialStep,
    buildHintStep,
    hoveredSegmentId,
    showModal, closeModal, dismissModal, selectTower,
    clearSelectedTower, openBuildPanel, closeBuildPanel, hideBuildPanel,
    setBuildHintStep,
    setHoveredSegmentId,
  }
})
