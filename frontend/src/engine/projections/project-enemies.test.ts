import { describe, expect, it } from 'vitest'
import { projectEnemyScene } from './project-enemies'
import { createMockEnemy, createMockGame } from '@/systems/__tests__/helpers'

describe('projectEnemyScene', () => {
  it('exposes frost intensity while slow effects are active', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ slowFactor: 0.4, slowTimer: 3 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.frostRatio).toBeCloseTo(0.4)
  })

  it('does not show frost after the slow timer expires', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ slowFactor: 0.4, slowTimer: 0 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.frostRatio).toBe(0)
  })

  it('projects regenerating: true for a Regenerator below max HP', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ regenPerSec: 18, hp: 50, maxHp: 80 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.regenerating).toBe(true)
  })

  it('projects regenerating: false for a Regenerator at full HP', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ regenPerSec: 18, hp: 80, maxHp: 80 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.regenerating).toBe(false)
  })

  it('projects regenerating: false for a non-regenerating enemy', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ regenPerSec: 0, hp: 30, maxHp: 100 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.regenerating).toBe(false)
  })
})
