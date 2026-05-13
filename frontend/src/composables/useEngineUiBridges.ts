/**
 * useEngineUiBridges — engine ↔ uiStore plumbing (F-ARCH-5).
 *
 * - hovered segment id (uiStore → game.hoveredSegmentId) for the FunctionPanel hover
 * - tower-selected event → open/close BuildPanel
 * - tower-placed event   → open BuildPanel + advance build-hint
 * - tower-removed event  → close BuildPanel if it's showing the removed one
 * - phase-changed event  → maintain timeExcludePrepare (BUILD / pause-phase intervals)
 *
 * All bridges return their unsubscribers so the caller can mix them into one
 * teardown bag.
 */
import { watch } from 'vue'
import { Events, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'
import { useUiStore } from '@/stores/uiStore'

export function bindEngineUiBridges(g: Game): (() => void)[] {
  const uiStore = useUiStore()
  const offs: (() => void)[] = []

  offs.push(watch(
    () => uiStore.hoveredSegmentId,
    (id) => { g.hoveredSegmentId = id },
    { immediate: true },
  ))

  offs.push(g.eventBus.on(Events.TOWER_SELECTED, (tower) => {
    if (
      tower
      && typeof tower === 'object'
      && 'id' in tower
      && typeof (tower as { id: unknown }).id === 'string'
      && 'type' in tower
      && typeof (tower as { type: unknown }).type === 'string'
      && 'params' in tower
      && typeof (tower as { params: unknown }).params === 'object'
    ) {
      uiStore.openBuildPanel((tower as Tower).id)
    } else {
      uiStore.closeBuildPanel()
    }
  }))

  offs.push(g.eventBus.on(Events.TOWER_PLACED, (tower) => {
    uiStore.openBuildPanel(tower.id)
    uiStore.setBuildHintStep(2)
  }))

  offs.push(g.eventBus.on(Events.TOWER_REMOVED, ({ towerId }) => {
    if (uiStore.buildPanelTowerId === towerId) uiStore.closeBuildPanel()
  }))

  offs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ from, to }) => {
    if (to === GamePhase.BUILD && g.state.wave > 0) {
      g.state.prepPhaseStart = g.time
    }
    if (from === GamePhase.BUILD && g.state.prepPhaseStart > 0) {
      const duration = g.time - g.state.prepPhaseStart
      g.state.timeExcludePrepare.push(duration)
      g.state.prepPhaseStart = 0
    }
    // Track MONTY_HALL and CHAIN_RULE as UI-pause phases so their duration is
    // excluded from activeTime = timeTotal - sum(timeExcludePrepare).
    if (to === GamePhase.MONTY_HALL || to === GamePhase.CHAIN_RULE) {
      g.state.pausePhaseStart = g.time
    }
    if ((from === GamePhase.MONTY_HALL || from === GamePhase.CHAIN_RULE) && g.state.pausePhaseStart > 0) {
      g.state.timeExcludePrepare.push(g.time - g.state.pausePhaseStart)
      g.state.pausePhaseStart = 0
    }
  }))

  return offs
}
