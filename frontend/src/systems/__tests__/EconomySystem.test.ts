import { describe, it, expect } from 'vitest'
import { EconomySystem } from '../EconomySystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

describe('EconomySystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE, gold: 100, hp: 20, score: 0, kills: 0 })
    const system = new EconomySystem()
    system.init(game)
    return { game }
  }

  it('decreases HP by 1 when enemy reaches origin without shield', () => {
    const { game } = setup()
    const enemy = createMockEnemy()

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    expect(game.state.hp).toBe(19)
  })

  // Q4+Q5: shield halves (not blocks) each absorbed hit; rounded up so a
  // 1-damage Swarmling still costs 1 HP, but a 2-damage Strong only costs 1.
  it('halves an absorbed hit while the shield is active (ceil-rounded)', () => {
    const { game } = setup()
    game.state.shieldActive = true
    game.state.shieldHitsRemaining = 3
    game.state.shieldReductionFactor = 0.5
    const enemy = createMockEnemy({ damage: 2 })

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    // ceil(2 * 0.5) = 1
    expect(game.state.hp).toBe(19)
    expect(game.state.shieldHitsRemaining).toBe(2)
    expect(game.state.shieldActive).toBe(true)
  })

  it('1-damage enemies still cost 1 HP through the shield (ceil floor)', () => {
    const { game } = setup()
    game.state.shieldActive = true
    game.state.shieldHitsRemaining = 3
    game.state.shieldReductionFactor = 0.5
    const enemy = createMockEnemy({ damage: 1 })

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    expect(game.state.hp).toBe(19)
    expect(game.state.shieldHitsRemaining).toBe(2)
  })

  it('shield deactivates after the 3rd absorbed hit and resets the factor', () => {
    const { game } = setup()
    game.state.shieldActive = true
    game.state.shieldHitsRemaining = 1
    game.state.shieldReductionFactor = 0.5
    const enemy = createMockEnemy({ damage: 2 })

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    expect(game.state.shieldActive).toBe(false)
    expect(game.state.shieldHitsRemaining).toBe(0)
    expect(game.state.shieldReductionFactor).toBe(1)
  })

  it('grants gold on enemy killed based on reward and multiplier', () => {
    const { game } = setup()
    const enemy = createMockEnemy({ reward: 20 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(120) // 100 + 20
  })

  it('applies gold multiplier', () => {
    const { game } = setup()
    game.state.goldMultiplier = 2
    const enemy = createMockEnemy({ reward: 15 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(130) // 100 + 15 * 2
  })

  // Q15: stacked gold buffs land on `goldMultiplier` via BuffSystem
  // recomputeGoldMult, not as direct writes. EconomySystem just reads the
  // resolved value, so verify the read uses the derived (additive) figure.
  it('reads the derived goldMultiplier when buffs stack additively', () => {
    const { game } = setup()
    // Simulate ×2 + ×3 → bonus 3 → multiplier 4 (BuffSystem's contract).
    game.state.goldMultiplierBonus = 3
    game.state.goldMultiplier = 1 + game.state.goldMultiplierBonus
    const enemy = createMockEnemy({ reward: 15 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    // 100 + round(15 * 4) = 160 (was 190 under the old multiplicative 6×)
    expect(game.state.gold).toBe(160)
  })

  it('increments kills and score on enemy killed', () => {
    const { game } = setup()
    const enemy = createMockEnemy()

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.kills).toBe(1)
    expect(game.state.score).toBe(10)
  })

  it('uses default reward of 15 when enemy has no reward', () => {
    const { game } = setup()
    const enemy = createMockEnemy({ reward: 0 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(115) // 100 + 15 (fallback)
  })

  // ── Boss reaching origin ends the level (bug 2.6) ──
  // Boss damage = 99 (per enemy-defs); player maxHp = 20.
  // A single boss reaching origin must drop HP to 0 and trigger GAME_OVER.
  describe('boss reaches origin', () => {
    function bossSetup() {
      const game = createMockGame({ phase: GamePhase.WAVE, gold: 100, hp: 20 })
      // The mock game's setPhase consults its PhaseStateMachine; sync it to WAVE
      // so the GAME_OVER transition triggered by HP=0 is legal.
      game.phase.forceTransition(GamePhase.WAVE)
      const system = new EconomySystem()
      system.init(game)
      return { game }
    }

    it('drops HP to 0 and transitions to GAME_OVER', () => {
      const { game } = bossSetup()
      const boss = createMockEnemy({ damage: 99 })

      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, boss)

      expect(game.state.hp).toBe(0)
      expect(game.state.phase).toBe(GamePhase.GAME_OVER)
    })

    // Q4+Q5: shield halves boss damage instead of fully blocking it. With
    // boss.damage=99 and factor=0.5 the player takes ceil(99 * 0.5) = 50 HP.
    // Starting HP=100 → ends at 50 and the run continues (not GAME_OVER).
    it('shield halves the boss hit — player survives at 50/100', () => {
      // Override maxHp too: changeHp clamps to maxHp, and the mock defaults
      // it to INITIAL_HP from createInitialState, which is 20 in test fixtures.
      const game = createMockGame({ phase: GamePhase.WAVE, gold: 100, hp: 100, maxHp: 100 })
      game.phase.forceTransition(GamePhase.WAVE)
      const system = new EconomySystem()
      system.init(game)
      game.state.shieldActive = true
      game.state.shieldHitsRemaining = 3
      game.state.shieldReductionFactor = 0.5
      const boss = createMockEnemy({ damage: 99 })

      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, boss)

      // ceil(99 * 0.5) = 50 → hp 100 - 50 = 50
      expect(game.state.hp).toBe(50)
      expect(game.state.phase).not.toBe(GamePhase.GAME_OVER)
      expect(game.state.shieldHitsRemaining).toBe(2)
    })

    it('per-enemy damage is honoured (strong enemy damage=2)', () => {
      const { game } = bossSetup()
      const tank = createMockEnemy({ damage: 2 })

      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, tank)

      expect(game.state.hp).toBe(18)
    })
  })
})
