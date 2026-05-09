/**
 * gameStore — read-only mirror of Game.state for Vue reactivity (F-ARCH-1).
 *
 * Every write into this store originates from an engine event; components
 * read from it but do NOT issue commands through it. Player-initiated
 * commands live in `services/gameCommandService.ts`. The RAF-driven
 * timing/cooldown sync was moved into `useGameLoop`.
 *
 * Responsibilities:
 *   - mirror Game.state into reactive refs via EventBus subscriptions
 *   - hold derived computeds (isBuilding, hpPercent, activeTime)
 *   - own the path-panel slice (written by the project-path-panel projection)
 *   - hold the §12 Star-5 checkpoint between runs
 *
 * Non-responsibilities (moved out by F-ARCH-1):
 *   - issuing commands → gameCommandService
 *   - RAF loop          → useGameLoop._startTimingMirror
 *   - reaching into systems (e.g. MontyHallSystem) → gameCommandService
 */
import { defineStore } from 'pinia'
import { ref, reactive, shallowRef, computed } from 'vue'
import { GamePhase, Events } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { ActiveBuffEntry } from '@/engine/GameState'
import type { BuffCard } from '@/data/buff-defs'
import type { PathSegmentView } from '@/engine/projections/project-path-panel'
import type { CalculusState } from '@/entities/types'
import type { MontyHallState } from '@/systems/MontyHallSystem'
import type { Checkpoint } from '@/domain/level/checkpoint'
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
  const starRating = ref(1)
  const wave = ref(0)
  const totalWaves = ref(0)
  const gold = ref(200)
  const hp = ref(20)
  const maxHp = ref(20)
  const score = ref(0)
  const kills = ref(0)
  const cumulativeKillValue = ref(0)
  const enemiesAlive = ref(0)

  // V2 Economy
  const costTotal = ref(0)
  const healthOrigin = ref(20)

  // V2 Timing
  const timeTotal = ref(0)
  const timeExcludePrepare = ref<number[]>([])

  // V2 Initial Answer
  const initialAnswer = ref<0 | 1>(0)
  const pathsVisible = ref(false)

  // V1 compat (BuffCardPanel reads this; V2 flow never enters BUFF_SELECT)
  const buffCards = ref<BuffCard[]>([])

  // V2 Monty Hall
  const montyHallProgress = ref(0)
  const montyHallState = ref<MontyHallState | null>(null)

  // V2 Active buffs
  const activeBuffs = shallowRef<ReadonlyArray<ActiveBuffEntry>>([])

  // V2 Calculus tower states (reactive mirror of tower.calculusState per towerId)
  const calculusStates = shallowRef<Record<string, CalculusState | null>>({})

  // Increments on every successful tower upgrade — forces TowerInfoPanel to re-evaluate
  const towerUpgradeTick = ref(0)

  // V2 Spell cooldowns (refreshed by useGameLoop's timing-mirror RAF tick)
  const spellCooldowns = ref<Record<string, number>>({})

  // Concrete-fading on Star-1 path rendering (spec §17). Set by GameView
  // from the authenticated profile's rolling-10 IA accuracy and the active
  // star rating (Star ≥ 2 always gets 0). Consumed by the curve renderer
  // when it draws the Star-1 path with y-axis labels at integer x.
  const pathLabelOpacity = ref(0)

  // Wave checkpoint for Star-5 retry (Pedagogical Backlog §12). Captured on
  // WAVE_END only when starRating == 5; consumed by GameView's GAME_OVER UI.
  // Survives LEVEL_START so a player who dies again after a checkpoint retry
  // (without clearing a new wave) can still re-retry from the same point.
  const lastCheckpoint = ref<Checkpoint | null>(null)
  // True for the current run if it began from a checkpoint restore. Drives
  // the §12.6 "practice — not eligible for class leaderboards" disclaimer
  // on the Score Result View.
  const isCheckpointRun = ref(false)

  // Piecewise paths
  const _pathPanelSegments = shallowRef<ReadonlyArray<PathSegmentView>>([])
  const _pathPanelCurrentId = ref<string | null>(null)
  const _pathPanelLeadX = ref(0)

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
  const isMontyHall = computed(() => phase.value === GamePhase.MONTY_HALL)
  const hpPercent = computed(() => (hp.value / maxHp.value) * 100)

  const activeTime = computed(() => {
    const prepSum = timeExcludePrepare.value.reduce((a, b) => a + b, 0)
    return Math.max(0, timeTotal.value - prepSum)
  })

  // ── Engine binding ──
  let _game: Game | null = null
  let _unsubscribes: (() => void)[] = []

  function bindEngine(game: Game): void {
    unbindEngine()
    _game = game
    syncFromEngine(game)

    _unsubscribes = [
      game.eventBus.on(Events.PHASE_CHANGED, ({ to }) => {
        phase.value = to
      }),
      game.eventBus.on(Events.GOLD_CHANGED, (v) => { gold.value = v }),
      game.eventBus.on(Events.HP_CHANGED, (v) => { hp.value = v }),
      game.eventBus.on(Events.SCORE_CHANGED, (v) => { score.value = v }),
      game.eventBus.on(Events.KILL_VALUE_CHANGED, (v) => {
        cumulativeKillValue.value = v
        montyHallProgress.value = v
      }),
      game.eventBus.on(Events.COST_TOTAL_CHANGED, (v) => { costTotal.value = v }),
      game.eventBus.on(Events.WAVE_START, (w) => {
        wave.value = w
        totalWaves.value = game.state.totalWaves
        enemiesAlive.value = game.enemies.length
      }),
      game.eventBus.on(Events.ENEMY_KILLED, () => {
        kills.value = game.state.kills
        cumulativeKillValue.value = game.state.cumulativeKillValue
        enemiesAlive.value = game.enemies.length
      }),
      game.eventBus.on(Events.ENEMY_SPAWNED, () => {
        enemiesAlive.value = game.enemies.length
      }),
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => {
        enemiesAlive.value = game.enemies.length
      }),
      game.eventBus.on(Events.WAVE_END, (snapshot) => {
        // Star-5 only — other difficulties retain a full restart on GAME_OVER.
        if (game.state.starRating === 5) {
          lastCheckpoint.value = {
            waveIndex: snapshot.wave + 1,
            gold: snapshot.gold,
            hp: snapshot.hp,
            costTotal: snapshot.costTotal,
            killValue: snapshot.killValue,
          }
        }
      }),
      game.eventBus.on(Events.LEVEL_START, (l) => {
        level.value = l
        starRating.value = game.state.starRating
        wave.value = 0
        score.value = 0
        kills.value = 0
        cumulativeKillValue.value = 0
        costTotal.value = 0
        healthOrigin.value = game.state.healthOrigin
        timeTotal.value = 0
        timeExcludePrepare.value = []
        initialAnswer.value = game.state.initialAnswer
        pathsVisible.value = game.state.pathsVisible
        montyHallProgress.value = 0
        montyHallState.value = null
        enemiesAlive.value = 0
        activeBuffs.value = []
        spellCooldowns.value = {}
        calculusStates.value = {}
      }),
      game.eventBus.on(Events.MONTY_HALL_STATE_CHANGED, (state) => {
        montyHallState.value = state
      }),
      game.eventBus.on(Events.ACTIVE_BUFFS_CHANGED, (buffs) => {
        activeBuffs.value = buffs
      }),
      game.eventBus.on(Events.TOWER_UPGRADED, () => { towerUpgradeTick.value++ }),
      game.eventBus.on(Events.CALCULUS_STATE_CHANGED, ({ towerId, state }) => {
        const next = { ...calculusStates.value }
        if (state === null) {
          delete next[towerId]
        } else {
          next[towerId] = state
        }
        calculusStates.value = next
      }),
    ]
  }

  function unbindEngine(): void {
    for (const unsub of _unsubscribes) unsub()
    _unsubscribes = []
    _game = null
    // Drop the checkpoint when the player leaves the game view entirely;
    // re-entering from the menu should always start fresh.
    lastCheckpoint.value = null
    isCheckpointRun.value = false
  }

  function clearCheckpoint(): void {
    lastCheckpoint.value = null
  }

  function setCheckpoint(cp: Checkpoint | null): void {
    lastCheckpoint.value = cp
  }

  function markCheckpointRun(): void {
    isCheckpointRun.value = true
  }

  function syncFromEngine(game: Game): void {
    const s = game.state
    phase.value = s.phase
    level.value = s.level
    starRating.value = s.starRating
    wave.value = s.wave
    gold.value = s.gold
    hp.value = s.hp
    maxHp.value = s.maxHp
    score.value = s.score
    kills.value = s.kills
    cumulativeKillValue.value = s.cumulativeKillValue
    costTotal.value = s.costTotal
    healthOrigin.value = s.healthOrigin
    timeTotal.value = s.timeTotal
    timeExcludePrepare.value = [...s.timeExcludePrepare]
    initialAnswer.value = s.initialAnswer
    pathsVisible.value = s.pathsVisible
    activeBuffs.value = [...s.activeBuffs]
  }

  /**
   * Used by useGameLoop's RAF mirror to push timeTotal + spellCooldowns into
   * reactive state every Nth frame. Keeping the writes here (rather than
   * letting useGameLoop reach into the refs) preserves the rule that this
   * file is the only place gameStore state mutates.
   */
  function pushTimingTick(timeTotalNow: number, spellCooldownsNow: Record<string, number>): void {
    timeTotal.value = timeTotalNow
    spellCooldowns.value = { ...spellCooldownsNow }
  }

  function getEngine(): Game | null {
    return _game
  }

  return {
    phase, level, starRating, wave, totalWaves,
    gold, hp, maxHp, score, kills, cumulativeKillValue, enemiesAlive, buffCards,
    costTotal, healthOrigin, timeTotal, timeExcludePrepare,
    initialAnswer, pathsVisible, montyHallProgress, montyHallState,
    activeBuffs, spellCooldowns, calculusStates, towerUpgradeTick,
    pathLabelOpacity,
    pathPanel,
    lastCheckpoint, isCheckpointRun,
    setPathPanelSegments, setCurrentSegment, setLeadEnemyX, clearPathPanel,
    isBuilding, isWave, isBuff, isMontyHall, hpPercent, activeTime,
    bindEngine, unbindEngine, syncFromEngine, getEngine,
    pushTimingTick,
    clearCheckpoint, setCheckpoint, markCheckpointRun,
  }
})
