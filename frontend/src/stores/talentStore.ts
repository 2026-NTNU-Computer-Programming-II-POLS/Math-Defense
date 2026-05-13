import { defineStore } from 'pinia'
import { ref } from 'vue'
import { talentService } from '@/services/talentService'
import { appBus } from '@/lib/app-bus'
import type { TowerType } from '@/data/constants'

export const useTalentStore = defineStore('talent', () => {
  const modifiers = ref<Record<string, Record<string, number>>>({})
  const loaded = ref(false)

  // Subscribe once on store init. The store is a Pinia singleton for the
  // page lifetime so the listener never needs to detach. (HMR may register
  // a duplicate against a stale store — a trivial dev-only leak.)
  appBus.on('auth:logout', () => { clear() })

  async function load(): Promise<void> {
    try {
      const res = await talentService.getModifiers()
      modifiers.value = res.modifiers
      loaded.value = true
    } catch {
      modifiers.value = {}
    }
  }

  function getTowerModifiers(towerType: TowerType): Record<string, number> {
    return modifiers.value[towerType] ?? {}
  }

  function getStatBonus(towerType: TowerType, attribute: string): number {
    return modifiers.value[towerType]?.[attribute] ?? 0
  }

  function clear(): void {
    modifiers.value = {}
    loaded.value = false
  }

  return { modifiers, loaded, load, getTowerModifiers, getStatBonus, clear }
})
