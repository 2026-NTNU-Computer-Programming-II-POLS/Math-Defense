/**
 * gameStore — game state Pinia Store
 * Bridges the engine EventBus → Vue reactivity so Vue components can read game state.
 */
import { defineStore } from 'pinia'
import { ref, reactive, shallowRef, computed } from 'vue'
// buffCards intentionally uses `ref` (not shallowRef) so future in-place
// mutations (e.g. `buffCards.value[0].probability = 0.7`) still trigger UI
// updates. The performance cost is negligible for a 3-element array.
import { GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { Events } from '@/data/constants'
import type { BuffDef } from '@/data/buff-defs'
// `PathSegmentView` is authored in the engine projection (the producer)
// and re-exported here so components that only know about the store can
// pull the type without reaching into `@/engine/`.
import type { PathSegmentView } from '@/engine/projections/project-path-panel'
export type { PathSegmentView } from '@/engine/projections/project-path-panel'

export interface PathPanelState {
  readonly segments: ReadonlyArray<PathSegmentView>
  readonly currentSegmentId: string | null
  readonly leadEnemyX: number
}

export const useGameStore = defineStore('game', () => {
  // ── State (mirrored from Game.state) ──
  const phase = ref<GamePhase>(GamePhase.MENU)
  const level = ref(1)
  const wave = ref(0)
  const totalWaves = ref(0)
  const gold = ref(200)
  const hp = ref(20)
  const maxHp = ref(20)
  const score = ref(0)
  const kills = ref(0)
  const buffCards = ref<(BuffDef & { isCurse: boolean })[]>([])

  // Piecewise paths (spec §5.5): segment list is stored in a `shallowRef`
  // so assigning a new array triggers reactivity without Vue recursively
  // proxying every `PathSegmentView` on every projection pass (§13 risk
  // row). `currentSegmentId` and `leadEnemyX` are primitive-valued refs
  // — plain `ref` is correct for those.
  const _pathPanelSegments = shallowRef<ReadonlyArray<PathSegmentView>>([])
  const _pathPanelCurrentId = ref<string | null>(null)
  const _pathPanelLeadX = ref(0)

  // Expose the grouped shape components read as `gameStore.pathPanel.*`.
  // Getters forward to the underlying refs so the outer object is a stable
  // reference; reactive() wraps the getter descriptors so reads are
  // dependency-tracked without copying values.
  const pathPanel = reactive<PathPanelState>({
    get segments() { return _pathPanelSegments.value },
    get currentSegmentId() { return _pathPanelCurrentId.value },
    get leadEnemyX() { return _pathPanelLeadX.value },
  })

  function setPathPanelSegments(views: ReadonlyArray<PathSegmentView>): void {
    _pathPanelSegments.value = views
  }
  function setCurrentSegment(id: string | null): void {
    _pathPanelCurrentId.value = id
  }
  function setLeadEnemyX(x: number): void {
    _pathPanelLeadX.value = x
  }
  function clearPathPanel(): void {
    _pathPanelSegments.value = []
    _pathPanelCurrentId.value = null
    _pathPanelLeadX.value = 0
  }

  // ── Computed ──
  const isBuilding = computed(() => phase.value === GamePhase.BUILD)
  const isWave = computed(() => phase.value === GamePhase.WAVE)
  const isBuff = computed(() => phase.value === GamePhase.BUFF_SELECT)
  const hpPercent = computed(() => (hp.value / maxHp.value) * 100)

  // ── Engine binding ──
  let _game: Game | null = null
  let _unsubscribes: (() => void)[] = []

  function bindEngine(game: Game): void {
    // clear any existing binding first
    unbindEngine()

    _game = game

    // sync initial state
    syncFromEngine(game)

    // subscribe to events to update reactive state; retain unsubscribe handles
    _unsubscribes = [
      game.eventBus.on(Events.PHASE_CHANGED, ({ to }) => {
        phase.value = to
        if (to !== GamePhase.BUFF_SELECT) buffCards.value = []
      }),
      game.eventBus.on(Events.GOLD_CHANGED, (v) => { gold.value = v }),
      game.eventBus.on(Events.HP_CHANGED, (v) => { hp.value = v }),
      game.eventBus.on(Events.SCORE_CHANGED, (v) => { score.value = v }),
      game.eventBus.on(Events.WAVE_START, (w) => {
        wave.value = w
        totalWaves.value = game.state.totalWaves
      }),
      // Kill count is owned by EconomySystem (game.state.kills++); the store
      // mirrors it via syncFromEngine so there is a single source of truth.
      // Do NOT increment kills.value here — it would double-count.
      game.eventBus.on(Events.ENEMY_KILLED, () => { kills.value = game.state.kills }),
      game.eventBus.on(Events.LEVEL_START, (l) => {
        level.value = l
        wave.value = 0
        score.value = 0
        kills.value = 0
      }),
      // BuffSystem emits BUFF_CARDS_UPDATED with a freshly built array each
      // draw. Taking the payload directly (rather than reaching into
      // buffSystem.currentCards) means future mutations inside the system
      // can never leak into the store's snapshot.
      game.eventBus.on(Events.BUFF_CARDS_UPDATED, (cards) => {
        buffCards.value = cards.map((c) => ({ ...c }))
      }),
    ]
  }

  function unbindEngine(): void {
    for (const unsub of _unsubscribes) unsub()
    _unsubscribes = []
    _game = null
  }

  function syncFromEngine(game: Game): void {
    const s = game.state
    phase.value = s.phase
    level.value = s.level
    wave.value = s.wave
    gold.value = s.gold
    hp.value = s.hp
    maxHp.value = s.maxHp
    score.value = s.score
    kills.value = s.kills
  }

  function getEngine(): Game | null {
    return _game
  }

  return {
    phase, level, wave, totalWaves,
    gold, hp, maxHp, score, kills, buffCards,
    pathPanel,
    setPathPanelSegments, setCurrentSegment, setLeadEnemyX, clearPathPanel,
    isBuilding, isWave, isBuff, hpPercent,
    bindEngine, unbindEngine, syncFromEngine, getEngine,
  }
})
