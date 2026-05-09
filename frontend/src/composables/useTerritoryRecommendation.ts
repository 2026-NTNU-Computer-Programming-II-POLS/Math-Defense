import { ref, watch, type Ref } from 'vue'
import { territoryService, type TerritoryRecommendation } from '@/services/territoryService'

export function useTerritoryRecommendation(activityId: Ref<string | null>) {
  const data = ref<TerritoryRecommendation | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    if (!activityId.value) {
      data.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      data.value = await territoryService.getTerritoryRecommendation(activityId.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      data.value = null
    } finally {
      loading.value = false
    }
  }

  watch(activityId, load, { immediate: true })

  return { data, loading, error, reload: load }
}

export const RECOMMENDATION_RATIONALE_COPY: Record<string, string> = {
  step_up_one_level: 'You are scoring well at the level below. Try one step up.',
  first_attempt: 'No recent sessions yet — start with a low-difficulty slot.',
}
