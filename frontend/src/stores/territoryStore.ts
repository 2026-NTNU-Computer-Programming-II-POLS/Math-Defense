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

  const loadingActivities = ref(false)
  const loadingDetail = ref(false)
  const loadingRankings = ref(false)

  const errorActivities = ref('')
  const errorDetail = ref('')
  const errorPlay = ref('')
  const errorCreate = ref('')
  const errorRankings = ref('')
  const errorSettle = ref('')

  async function loadActivities(classId?: string): Promise<void> {
    loadingActivities.value = true
    errorActivities.value = ''
    try {
      activities.value = await territoryService.listActivities(classId)
    } catch (e) {
      errorActivities.value = e instanceof Error ? e.message : 'Failed to load activities'
    } finally {
      loadingActivities.value = false
    }
  }

  async function loadDetail(activityId: string): Promise<void> {
    loadingDetail.value = true
    errorDetail.value = ''
    try {
      currentDetail.value = await territoryService.getActivity(activityId)
    } catch (e) {
      errorDetail.value = e instanceof Error ? e.message : 'Failed to load activity'
    } finally {
      loadingDetail.value = false
    }
  }

  async function createActivity(payload: {
    title: string
    deadline: string
    class_id?: string | null
    slots: SlotDefinition[]
  }): Promise<ActivityInfo | null> {
    errorCreate.value = ''
    try {
      const activity = await territoryService.createActivity(payload)
      return activity
    } catch (e) {
      errorCreate.value = e instanceof Error ? e.message : 'Failed to create activity'
      return null
    }
  }

  async function playSlot(activityId: string, slotId: string, sessionId: string): Promise<PlayResult | null> {
    errorPlay.value = ''
    try {
      return await territoryService.playTerritory(activityId, slotId, sessionId)
    } catch (e) {
      errorPlay.value = e instanceof Error ? e.message : 'Failed to play territory'
      return null
    }
  }

  async function loadRankings(activityId: string): Promise<void> {
    loadingRankings.value = true
    errorRankings.value = ''
    try {
      rankings.value = await territoryService.getRankings(activityId)
    } catch (e) {
      errorRankings.value = e instanceof Error ? e.message : 'Failed to load rankings'
    } finally {
      loadingRankings.value = false
    }
  }

  async function settleActivity(activityId: string): Promise<boolean> {
    errorSettle.value = ''
    try {
      await territoryService.settleActivity(activityId)
      return true
    } catch (e) {
      errorSettle.value = e instanceof Error ? e.message : 'Failed to settle activity'
      return false
    }
  }

  function clear(): void {
    activities.value = []
    currentDetail.value = null
    rankings.value = []
    errorActivities.value = ''
    errorDetail.value = ''
    errorPlay.value = ''
    errorCreate.value = ''
    errorRankings.value = ''
    errorSettle.value = ''
  }

  return {
    activities,
    currentDetail,
    rankings,
    loadingActivities,
    loadingDetail,
    loadingRankings,
    errorActivities,
    errorDetail,
    errorPlay,
    errorCreate,
    errorRankings,
    errorSettle,
    loadActivities,
    loadDetail,
    createActivity,
    playSlot,
    loadRankings,
    settleActivity,
    clear,
  }
})
