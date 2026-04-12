/**
 * uiStore — UI state Pinia Store
 * Manages panel visibility, selected tower, and other UI-only state.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TowerType } from '@/data/constants'

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
  const modalCallback = ref<(() => void) | null>(null)

  // Tutorial
  const tutorialVisible = ref(false)
  const tutorialStep = ref(0)

  // HUD hint
  const buildHintStep = ref(0)   // 0=select tower  1=click cell  2=set params  3=Cast Spell

  function showModal(title: string, message: string, onClose?: () => void): void {
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
      const result = cb() as unknown
      // Catch async rejections too (e.g. router.push returning a rejected
      // Promise) — otherwise the user sees the modal disappear but never
      // finds out the action actually failed.
      if (result && typeof (result as { then?: unknown }).then === 'function') {
        (result as Promise<unknown>).catch((e) => {
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
    modalVisible, modalTitle, modalMessage, modalCallback,
    tutorialVisible, tutorialStep,
    buildHintStep,
    showModal, closeModal, selectTower,
  }
})
