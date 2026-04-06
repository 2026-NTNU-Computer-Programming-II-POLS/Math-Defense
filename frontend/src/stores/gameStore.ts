/**
 * gameStore — 遊戲狀態 Pinia Store
 * 橋接引擎 EventBus → Vue reactivity，讓 Vue 元件讀取遊戲狀態。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { Events } from '@/data/constants'

export const useGameStore = defineStore('game', () => {
  // ── 狀態（mirror 自 Game.state） ──
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

  // ── Computed ──
  const isBuilding = computed(() => phase.value === GamePhase.BUILD)
  const isWave = computed(() => phase.value === GamePhase.WAVE)
  const isBuff = computed(() => phase.value === GamePhase.BUFF_SELECT)
  const hpPercent = computed(() => (hp.value / maxHp.value) * 100)

  // ── 引擎綁定 ──
  let _game: Game | null = null
  let _unsubscribes: (() => void)[] = []

  function bindEngine(game: Game): void {
    // 先清除舊的綁定
    unbindEngine()

    _game = game

    // 同步初始狀態
    syncFromEngine(game)

    // 監聽事件更新 reactive state，保留 unsubscribe handles
    _unsubscribes = [
      game.eventBus.on(Events.PHASE_CHANGED, ({ to }) => { phase.value = to }),
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
    gold, hp, maxHp, score, kills, pathExpression,
    isBuilding, isWave, isBuff, hpPercent,
    bindEngine, unbindEngine, syncFromEngine, getEngine,
  }
})
