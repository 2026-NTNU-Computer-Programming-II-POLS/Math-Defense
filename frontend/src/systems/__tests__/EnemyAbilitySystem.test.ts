/**
 * Pedagogical Backlog §25 — Boss-B chain-rule trigger HP fraction is sampled
 * uniformly per spawn from the configured triggerHpRange, using game.rng so
 * the draw is replayable. This pins:
 *   1. 100 spawns all land within [lo, hi] (no skips, no overshoot).
 *   2. Variation actually occurs across spawns (not all the same value).
 *   3. The same seed reproduces the same fraction (replay determinism).
 *
 * V3 Phase 3 — Regenerator constant HP regen tick.
 */
import { describe, it, expect } from 'vitest'
import { EnemyAbilitySystem } from '../EnemyAbilitySystem'
import { Events, EnemyType, GamePhase, ANIM } from '@/data/constants'
import { ENEMY_DEFS } from '@/data/enemy-defs'
import { mulberry32 } from '@/math/MathUtils'
import { createSegmentedPath, type PathSegmentRuntime, type SegmentedPath } from '@/domain/path/segmented-path'
import type { Enemy } from '@/entities/types'
import { createMockGame, createMockEnemy } from './helpers'

// A flat horizontal path at height `y` spanning [0, 20]; startX=20, targetX=0
// (the game's right→left travel convention). Used to assert that boss-spawned
// enemies land on the parent's curve rather than the level's primary curve.
function horizontalPathAt(y: number, id: string): SegmentedPath {
  const seg: PathSegmentRuntime = {
    id,
    kind: 'horizontal',
    xRange: [0, 20],
    params: { kind: 'horizontal', y },
    evaluate: () => y,
    evaluateDerivative: () => 0,
    expr: id,
    label: id,
  }
  return createSegmentedPath([seg])
}

function spawnAndCollect(seed: number, count: number): number[] {
  const game = createMockGame()
  game.rng = mulberry32(seed)

  const sys = new EnemyAbilitySystem()
  sys.init(game)

  const fractions: number[] = []
  for (let i = 0; i < count; i++) {
    const boss = createMockEnemy({ type: EnemyType.BOSS_B, hp: 600, maxHp: 600 })
    game.eventBus.emit(Events.ENEMY_SPAWNED, boss)
    fractions.push(boss.chainRuleTriggerFraction)
  }

  sys.destroy()
  return fractions
}

describe('§25 Boss-B trigger HP randomisation', () => {
  it('100 spawns all fall within the configured triggerHpRange', () => {
    const range = ENEMY_DEFS[EnemyType.BOSS_B].triggerHpRange
    expect(range).toBeDefined()
    const [lo, hi] = range!

    const fractions = spawnAndCollect(0xCAFEBABE, 100)
    for (const f of fractions) {
      expect(f).toBeGreaterThanOrEqual(lo)
      expect(f).toBeLessThanOrEqual(hi)
    }
  })

  it('produces variation across 10 spawns (not all identical)', () => {
    const fractions = spawnAndCollect(0xDEADBEEF, 10)
    const unique = new Set(fractions)
    // With a continuous uniform draw, 10 mulberry32 samples virtually never collide.
    expect(unique.size).toBeGreaterThan(1)
  })

  it('same seed reproduces the same first fraction (replay determinism)', () => {
    const a = spawnAndCollect(1234, 5)
    const b = spawnAndCollect(1234, 5)
    expect(a).toEqual(b)
  })

  it('non-Boss-B enemies do not get a trigger fraction sampled', () => {
    const game = createMockGame()
    game.rng = mulberry32(42)
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const fast = createMockEnemy({ type: EnemyType.FAST })
    game.eventBus.emit(Events.ENEMY_SPAWNED, fast)
    expect(fast.chainRuleTriggerFraction).toBe(0)

    sys.destroy()
  })
})

describe('V3 Phase 3 — Regenerator regen tick', () => {
  const DT = 1 / 60

  it('a Regenerator below maxHp regains regenPerSec * dt per update', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 40, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBeCloseTo(40 + 18 * DT, 4)

    sys.destroy()
  })

  it('regen is clamped at maxHp and never overshoots', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 79.9, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(80)

    sys.destroy()
  })

  it('regen still ticks on the frame after the enemy took damage (no interruption)', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 80, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    // Simulate a hit landing this frame, then the ability tick running.
    enemy.hp = 50
    sys.update(DT, game)
    expect(enemy.hp).toBeCloseTo(50 + 18 * DT, 4)

    sys.destroy()
  })

  it('a general enemy (regenPerSec 0) never regenerates', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({ type: EnemyType.GENERAL, hp: 50, maxHp: 100 })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(50)

    sys.destroy()
  })

  it('does not regen outside the WAVE phase', () => {
    const game = createMockGame({ phase: GamePhase.BUILD })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 40, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(40)

    sys.destroy()
  })
})

// Regression: in multi-curve generated levels game.levelContext.path is only
// the primary curve (paths[0]). A boss must drop its minions on its OWN curve
// (looked up via getEnemyPath) and register them there, or they teleport onto
// curve 0 and march down the wrong route, dodging the boss-lane defences.
describe('Boss minions inherit the boss path (multi-curve fix)', () => {
  it('Boss-A minion lands on the boss curve (y=5), registered there, not the primary (y=0)', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const primary = horizontalPathAt(0, 'primary')
    const bossPath = horizontalPathAt(5, 'boss')
    const assigned: { id: string; path: SegmentedPath }[] = []
    Object.assign(game as unknown as Record<string, unknown>, {
      levelContext: { path: primary },
      getEnemyPath: (id: string) => (id === 'boss-a' ? bossPath : null),
      assignEnemyPath: (id: string, path: SegmentedPath) => { assigned.push({ id, path }) },
    })

    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const spawned: Enemy[] = []
    game.eventBus.on(Events.ENEMY_SPAWNED, (e) => spawned.push(e))

    const boss = createMockEnemy({
      id: 'boss-a',
      type: EnemyType.BOSS_A,
      x: 10,
      y: 5,
      minionInterval: 8,
      minionType: EnemyType.GENERAL,
      minionTimer: 7.99, // one tick away from spawning
    })
    game.enemies.push(boss)

    sys.update(1 / 60, game)

    expect(spawned).toHaveLength(1)
    expect(spawned[0].type).toBe(EnemyType.GENERAL)
    // y=5 ⇒ on the boss's curve; y=0 would mean it fell back to paths[0].
    expect(spawned[0].y).toBe(5)
    expect(assigned).toHaveLength(1)
    expect(assigned[0].path).toBe(bossPath)
    expect(assigned[0].id).toBe(spawned[0].id)

    sys.destroy()
  })

  it('falls back to the primary curve (y=0) when the boss path is unknown', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    Object.assign(game as unknown as Record<string, unknown>, {
      levelContext: { path: horizontalPathAt(0, 'primary') },
    })

    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const spawned: Enemy[] = []
    game.eventBus.on(Events.ENEMY_SPAWNED, (e) => spawned.push(e))

    const boss = createMockEnemy({
      id: 'boss-a',
      type: EnemyType.BOSS_A,
      x: 10,
      y: 0,
      minionInterval: 8,
      minionType: EnemyType.GENERAL,
      minionTimer: 7.99,
    })
    game.enemies.push(boss)

    sys.update(1 / 60, game)

    expect(spawned).toHaveLength(1)
    expect(spawned[0].y).toBe(0)

    sys.destroy()
  })
})

// Regression: answering the Boss-B chain rule correctly must route the
// insta-kill through killEnemy so the boss gets the full death lifecycle
// (dying-window fields + ENEMY_DYING → death cinematic + screen shake) instead
// of vanishing silently, while still splitting exactly once (no double split).
describe('Boss-B chain-rule resolution — death lifecycle', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE })
    game.rng = mulberry32(7)
    // The mock's setPhase validates against the real PhaseStateMachine; put it
    // in WAVE so WAVE→CHAIN_RULE→WAVE transitions are accepted.
    game.phase.forceTransition(GamePhase.WAVE)
    ;(game as unknown as { levelContext: { path: SegmentedPath } }).levelContext = {
      path: horizontalPathAt(0, 'primary'),
    }

    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const dying: Enemy[] = []
    const killed: Enemy[] = []
    const spawned: Enemy[] = []
    let chainStart = 0
    game.eventBus.on(Events.ENEMY_DYING, (e) => dying.push(e))
    game.eventBus.on(Events.ENEMY_KILLED, (e) => killed.push(e))
    game.eventBus.on(Events.ENEMY_SPAWNED, (e) => spawned.push(e))
    game.eventBus.on(Events.CHAIN_RULE_START, () => { chainStart++ })

    const boss = createMockEnemy({
      id: 'boss-b',
      type: EnemyType.BOSS_B,
      x: 10,
      y: 0,
      hp: 600,
      maxHp: 600,
      size: 44,
      reward: 225,
      killValue: 150,
      speed: 0.7,
      chainRuleTriggerFraction: 0.5,
    })
    game.enemies.push(boss)

    return { game, sys, boss, dying, killed, spawned, chainStart: () => chainStart }
  }

  it('fires the chain rule once HP crosses the trigger fraction', () => {
    const { game, sys, boss, chainStart } = setup()
    boss.hp = 290 // below 600 * 0.5 = 300
    sys.update(1 / 60, game)
    expect(game.state.phase).toBe(GamePhase.CHAIN_RULE)
    expect(chainStart()).toBe(1)
    sys.destroy()
  })

  it('correct answer kills via killEnemy (dying fields + ENEMY_DYING) and splits exactly once', () => {
    const { game, sys, boss, dying, killed, spawned } = setup()
    boss.hp = 290
    sys.update(1 / 60, game)

    game.eventBus.emit(Events.CHAIN_RULE_ANSWER, { correct: true })

    // Full death lifecycle — missing before the fix (boss vanished instantly).
    expect(boss.alive).toBe(false)
    expect(boss.active).toBe(false)
    expect(boss.dying).toBe(true)
    expect(boss.deathMaxTime).toBe(ANIM.BOSS_DEATH)

    // ENEMY_DYING drives the boss cinematic + shake; fires exactly once.
    expect(dying.filter((e) => e.id === 'boss-b')).toHaveLength(1)
    // ENEMY_KILLED fires exactly once → single score / gold award.
    expect(killed.filter((e) => e.id === 'boss-b')).toHaveLength(1)

    // Exactly two children (STRONG + FAST); _onEnemyKilled must NOT double-split.
    expect(spawned).toHaveLength(2)
    expect(spawned.map((c) => c.type).sort()).toEqual(
      [EnemyType.FAST, EnemyType.STRONG].sort(),
    )

    expect(game.state.phase).toBe(GamePhase.WAVE)
    sys.destroy()
  })

  it('wrong answer keeps the boss alive with no children and no death FX', () => {
    const { game, sys, boss, dying, spawned } = setup()
    boss.hp = 290
    sys.update(1 / 60, game)

    game.eventBus.emit(Events.CHAIN_RULE_ANSWER, { correct: false })

    expect(boss.alive).toBe(true)
    expect(boss.dying).toBeFalsy()
    expect(spawned).toHaveLength(0)
    expect(dying).toHaveLength(0)
    expect(game.state.phase).toBe(GamePhase.WAVE)
    sys.destroy()
  })
})
