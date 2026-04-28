import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  territoryService,
  type ActivityInfo,
  type ActivityDetail,
  type RankingEntry,
  type PlayResult,
  type SlotDefinition,
} from '@/services/territoryService'

export const useTerritoryStore = defineStore('territory', () => {
  const activities = ref<ActivityInfo[]>([])
  const currentDetail = ref<ActivityDetail | null>(null)
  const rankings = ref<RankingEntry[]>([])
  const loading = ref(false)
  const error = ref('')

  async function loadActivities(classId?: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      activities.value = await territoryService.listActivities(classId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load activities'
    } finally {
      loading.value = false
    }
  }

  async function loadDetail(activityId: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      currentDetail.value = await territoryService.getActivity(activityId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load activity'
    } finally {
      loading.value = false
    }
  }

  async function createActivity(payload: {
    title: string
    deadline: string
    class_id?: string | null
    slots: SlotDefinition[]
  }): Promise<ActivityInfo | null> {
    error.value = ''
    try {
      const activity = await territoryService.createActivity(payload)
      return activity
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create activity'
      return null
    }
  }

  async function playSlot(activityId: string, slotId: string, score: number): Promise<PlayResult | null> {
    error.value = ''
    try {
      return await territoryService.playTerritory(activityId, slotId, score)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to play territory'
      return null
    }
  }

  async function loadRankings(activityId: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      rankings.value = await territoryService.getRankings(activityId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load rankings'
    } finally {
      loading.value = false
    }
  }

  async function settleActivity(activityId: string): Promise<boolean> {
    error.value = ''
    try {
      await territoryService.settleActivity(activityId)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to settle activity'
      return false
    }
  }

  return {
    activities,
    currentDetail,
    rankings,
    loading,
    error,
    loadActivities,
    loadDetail,
    createActivity,
    playSlot,
    loadRankings,
    settleActivity,
  }
})
