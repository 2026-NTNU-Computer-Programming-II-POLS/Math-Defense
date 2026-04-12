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

  function closeModal(): void {
    const cb = modalCallback.value
    modalCallback.value = null
    modalVisible.value = false
    if (!cb) return
    try {
      cb()
    } catch (e) {
      console.error('[Modal] Callback error:', e)
      // Surface the failure to the user so the UI isn't silently stuck
      // (e.g. router.push throwing leaves the player staring at an empty
      // overlay). Re-open with a generic error message.
      modalTitle.value = '發生錯誤'
      modalMessage.value = '操作未能完成，請再試一次。'
      modalCallback.value = null
      modalVisible.value = true
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
