/**
 * gameStore — game state Pinia Store
 * Bridges the engine EventBus → Vue reactivity so Vue components can read game state.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
// buffCards intentionally uses `ref` (not shallowRef) so future in-place
// mutations (e.g. `buffCards.value[0].probability = 0.7`) still trigger UI
// updates. The performance cost is negligible for a 3-element array.
import { GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { Events } from '@/data/constants'
import type { BuffDef } from '@/data/buff-defs'

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
  const pathExpression = ref('')
  const buffCards = ref<(BuffDef & { isCurse: boolean })[]>([])
  const bossShieldTarget = shallowRef<{ freqs: number[]; amps: number[] } | null>(null)

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
      game.eventBus.on(Events.ENEMY_KILLED, () => { kills.value++ }),
      game.eventBus.on(Events.LEVEL_START, (l) => {
        level.value = l
        wave.value = 0
        score.value = 0
        kills.value = 0
        pathExpression.value = game.state.pathExpression
      }),
      game.eventBus.on(Events.BUFF_PHASE_START, () => {
        const buffSys = game.getSystem('buff') as { currentCards: (BuffDef & { isCurse: boolean })[] } | undefined
        if (buffSys) buffCards.value = [...buffSys.currentCards]
      }),
      game.eventBus.on(Events.BOSS_SHIELD_START, () => {
        bossShieldTarget.value = game.state.bossShieldTarget
      }),
      game.eventBus.on(Events.BOSS_SHIELD_END, () => {
        bossShieldTarget.value = null
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
    pathExpression.value = s.pathExpression
  }

  function getEngine(): Game | null {
    return _game
  }

  return {
    phase, level, wave, totalWaves,
    gold, hp, maxHp, score, kills, pathExpression, buffCards, bossShieldTarget,
    isBuilding, isWave, isBuff, hpPercent,
    bindEngine, unbindEngine, syncFromEngine, getEngine,
  }
})
