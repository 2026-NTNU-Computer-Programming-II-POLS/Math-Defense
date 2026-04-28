import { defineStore } from 'pinia'
import { ref, reactive, shallowRef, computed } from 'vue'
import { GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { Events } from '@/data/constants'
import type { ActiveBuffEntry } from '@/engine/GameState'
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
  const buffCards = ref<unknown[]>([])

  // V2 Monty Hall
  const montyHallProgress = ref(0)

  // V2 Active buffs
  const activeBuffs = shallowRef<ReadonlyArray<ActiveBuffEntry>>([])

  // V2 Spell cooldowns
  const spellCooldowns = ref<Record<string, number>>({})

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
    _startTimingSync()

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
        enemiesAlive.value = 0
        activeBuffs.value = []
        spellCooldowns.value = {}
      }),
      game.eventBus.on(Events.ACTIVE_BUFFS_CHANGED, (buffs) => {
        activeBuffs.value = buffs
      }),
    ]
  }

  function unbindEngine(): void {
    _stopTimingSync()
    for (const unsub of _unsubscribes) unsub()
    _unsubscribes = []
    _game = null
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

  let _timingSyncRaf: number | null = null
  function _startTimingSync(): void {
    _stopTimingSync()
    let frameCount = 0
    const tick = () => {
      frameCount++
      if (_game && frameCount % 30 === 0) {
        timeTotal.value = _game.state.timeTotal
        spellCooldowns.value = { ..._game.state.spellCooldowns }
      }
      _timingSyncRaf = requestAnimationFrame(tick)
    }
    _timingSyncRaf = requestAnimationFrame(tick)
  }
  function _stopTimingSync(): void {
    if (_timingSyncRaf !== null) {
      cancelAnimationFrame(_timingSyncRaf)
      _timingSyncRaf = null
    }
  }

  function getEngine(): Game | null {
    return _game
  }

  return {
    phase, level, starRating, wave, totalWaves,
    gold, hp, maxHp, score, kills, cumulativeKillValue, enemiesAlive, buffCards,
    costTotal, healthOrigin, timeTotal, timeExcludePrepare,
    initialAnswer, pathsVisible, montyHallProgress,
    activeBuffs, spellCooldowns,
    pathPanel,
    setPathPanelSegments, setCurrentSegment, setLeadEnemyX, clearPathPanel,
    isBuilding, isWave, isBuff, isMontyHall, hpPercent, activeTime,
    bindEngine, unbindEngine, syncFromEngine, getEngine,
  }
})
