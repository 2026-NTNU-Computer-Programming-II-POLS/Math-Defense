/**
 * uiStore — UI state Pinia Store
 * Manages panel visibility, selected tower, and other UI-only state.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
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

  // Boss Shield Fourier target — visual cue only, driven by BOSS_SHIELD_START.
  // shallowRef: replaced whole rather than mutated, so deep reactivity is waste.
  const bossShieldTarget = shallowRef<{ freqs: number[]; amps: number[] } | null>(null)

  // Modal (replaces alert)
  const modalVisible = ref(false)
  const modalTitle = ref('')
  const modalMessage = ref('')
  // Callback may return a Promise; we await it for rejection-reporting below.
  const modalCallback = ref<(() => unknown) | null>(null)

  // Tutorial
  const tutorialVisible = ref(false)
  const tutorialStep = ref(0)

  // HUD hint
  const buildHintStep = ref(0)   // 0=select tower  1=click cell  2=set params  3=Cast Spell

  function showModal(title: string, message: string, onClose?: () => unknown): void {
    modalTitle.value = title
    modalMessage.value = message
    modalCallback.value = onClose ?? null
    modalVisible.value = true
  }

  function _showErrorFallback(): void {
    modalTitle.value = '發生錯誤'
    modalMessage.value = '操作未能完成，請再試一次。'
    modalCallback.value = null
    modalVisible.value = true
  }

  function closeModal(): void {
    const cb = modalCallback.value
    // Clear state first so that if cb throws / rejects we open a fresh error
    // modal on top of a cleared slot instead of re-opening on top of itself.
    modalCallback.value = null
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

  return {
    selectedTowerType,
    buildPanelVisible, buildPanelTowerId,
    buffPanelVisible,
    bossShieldTarget,
    modalVisible, modalTitle, modalMessage, modalCallback,
    tutorialVisible, tutorialStep,
    buildHintStep,
    showModal, closeModal, selectTower,
  }
})
