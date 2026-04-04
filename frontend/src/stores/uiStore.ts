/**
 * uiStore — UI 狀態 Pinia Store
 * 管理面板開關、選中塔等 UI-only 狀態。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TowerType } from '@/data/constants'

export const useUiStore = defineStore('ui', () => {
  // 選中的塔類型（塔選擇列）
  const selectedTowerType = ref<TowerType | null>(null)

  // Build Panel（參數設定面板）
  const buildPanelVisible = ref(false)
  const buildPanelTowerId = ref<string | null>(null)  // 點擊已放置的塔後顯示

  // Buff Card Panel
  const buffPanelVisible = ref(false)

  // Modal（取代 alert）
  const modalVisible = ref(false)
  const modalTitle = ref('')
  const modalMessage = ref('')
  const modalCallback = ref<(() => void) | null>(null)

  // Tutorial
  const tutorialVisible = ref(false)
  const tutorialStep = ref(0)

  // HUD 提示
  const buildHintStep = ref(0)   // 0=選塔 1=點格子 2=設參數 3=Cast Spell

  function showModal(title: string, message: string, onClose?: () => void): void {
    modalTitle.value = title
    modalMessage.value = message
    modalCallback.value = onClose ?? null
    modalVisible.value = true
  }

  function closeModal(): void {
    modalVisible.value = false
    modalCallback.value?.()
    modalCallback.value = null
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
