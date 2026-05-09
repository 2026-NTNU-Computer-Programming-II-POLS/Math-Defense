/**
 * usePrincipleOverlay — post-wave principle-surfacing overlay state machine
 * (F-ARCH-5, Pedagogical Backlog §1).
 *
 * Picks a principle id at WAVE_END, fixed principles for chain-rule and
 * Monty-Hall events. The selector biases toward novelty per §1.6 — see
 * pickPrincipleForWave for the heuristic.
 */
import { ref, watch } from 'vue'
import { Events } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { TOWER_TO_PRINCIPLE, type PrincipleId } from '@/data/principle-defs'
import { useUiStore } from '@/stores/uiStore'

export function createPrincipleOverlay() {
  const currentPrincipleId = ref<PrincipleId | null>(null)
  const shownPrincipleIdsThisLevel = new Set<PrincipleId>()

  function clearPrinciple(): void { currentPrincipleId.value = null }

  function bind(g: Game): (() => void)[] {
    const uiStore = useUiStore()
    const offs: (() => void)[] = []

    offs.push(g.eventBus.on(Events.LEVEL_START, () => {
      shownPrincipleIdsThisLevel.clear()
      currentPrincipleId.value = null
    }))

    offs.push(g.eventBus.on(Events.WAVE_END, () => {
      const id = pickPrincipleForWave(g, shownPrincipleIdsThisLevel)
      if (id !== null) g.eventBus.emit(Events.PRINCIPLE_SHOW, { id })
    }))

    offs.push(g.eventBus.on(Events.CHAIN_RULE_END, ({ correct }) => {
      if (correct) g.eventBus.emit(Events.PRINCIPLE_SHOW, { id: 'chain-rule' })
    }))

    offs.push(g.eventBus.on(Events.MONTY_HALL_RESULT, () => {
      g.eventBus.emit(Events.PRINCIPLE_SHOW, { id: 'monty-hall' })
    }))

    offs.push(g.eventBus.on(Events.PRINCIPLE_SHOW, ({ id }) => {
      if (!uiStore.principleOverlayEnabled) return
      shownPrincipleIdsThisLevel.add(id)
      currentPrincipleId.value = id
    }))

    // F-BUG-18: when the player disables the overlay mid-wave, hide whatever
    // is currently showing immediately rather than leaving it on screen until
    // the next PRINCIPLE_SHOW (which the disabled flag would then suppress).
    offs.push(watch(() => uiStore.principleOverlayEnabled, (enabled) => {
      if (!enabled) currentPrincipleId.value = null
    }))

    return offs
  }

  return { currentPrincipleId, clearPrinciple, bind }
}

/**
 * Pick a principle id for a wave just ended. Counts towers on the field by
 * archetype. Defaults to the dominant tower's principle (per §1.4 acceptance:
 * a Magic-dominated wave surfaces the magic-curve-zone principle). When the
 * dominant principle has already been shown this level, falls back to the
 * rarest unshown principle (per §1.6 risk mitigation: "rotate among the
 * towers used, prefer the rarest"). When everything has been shown, cycles
 * back to the dominant. Returns null when no towers are placed.
 */
export function pickPrincipleForWave(
  g: Pick<Game, 'towers'>,
  alreadyShown: ReadonlySet<PrincipleId>,
): PrincipleId | null {
  const counts = new Map<PrincipleId, number>()
  for (const tower of g.towers) {
    const principleId = TOWER_TO_PRINCIPLE[tower.type]
    if (principleId === undefined) continue
    counts.set(principleId, (counts.get(principleId) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  let dominant: { id: PrincipleId; count: number } | null = null
  let rarestUnshown: { id: PrincipleId; count: number } | null = null
  for (const [id, count] of counts) {
    if (dominant === null || count > dominant.count) dominant = { id, count }
    if (!alreadyShown.has(id) && (rarestUnshown === null || count < rarestUnshown.count)) {
      rarestUnshown = { id, count }
    }
  }

  if (dominant !== null && !alreadyShown.has(dominant.id)) return dominant.id
  if (rarestUnshown !== null) return rarestUnshown.id
  return dominant!.id
}
