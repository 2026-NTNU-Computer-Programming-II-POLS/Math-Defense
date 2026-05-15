import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/uiStore'
import { sessionService } from '@/services/sessionService'
import {
  generate as generateLevelForRun,
  LevelGenerationFailedError,
} from '@/services/levelGenerationService'

const MAX_LEVEL_JSON_BYTES = 64 * 1024

export interface TerritoryContext {
  activityId: string
  slotId: string
}

export function useStartRun() {
  const router = useRouter()
  const ui = useUiStore()

  async function startRun(
    starRating: number,
    seed: number,
    territoryContext?: TerritoryContext,
  ): Promise<void> {
    try {
      const active = await sessionService.getActive()
      if (active) {
        const ok = await ui.showConfirm(
          'Active session in progress',
          'You have an active game session in progress. Starting a new game will abandon it. Continue?',
          { confirmLabel: 'Continue', cancelLabel: '取消' },
        )
        if (!ok) return
      }
    } catch (error) {
      // Non-critical — proceed if the check fails.
      console.error('Failed to check active session:', error)
    }

    let level
    try {
      ({ level } = await generateLevelForRun(starRating, seed))
    } catch (e) {
      if (e instanceof LevelGenerationFailedError) {
        console.error('[startRun] Level generation failed', { starRating, seed }, e)
        ui.showModal('Level generation failed', 'Please try a different difficulty.')
        return
      }
      throw e
    }

    // F-BUG-14: cap serialized size so a malformed level can't bloat the history entry.
    const levelJson = JSON.stringify(level)
    if (levelJson.length > MAX_LEVEL_JSON_BYTES) {
      console.error('[startRun] Generated level JSON exceeds size cap', { bytes: levelJson.length })
      ui.showModal('Level too large', 'Generated level payload is unexpectedly large; please try again.')
      return
    }

    const state: Record<string, unknown> = { level: levelJson, seed }
    if (territoryContext) {
      state.territoryContext = JSON.stringify(territoryContext)
    }
    router.push({ name: 'initial-answer', state })
  }

  return { startRun }
}
