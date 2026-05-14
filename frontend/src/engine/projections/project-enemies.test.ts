import { describe, expect, it } from 'vitest'
import { projectEnemyScene } from './project-enemies'
import { createMockEnemy, createMockGame } from '@/systems/__tests__/helpers'

describe('projectEnemyScene', () => {
  it('exposes frost intensity while slow effects are active', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ slowFactor: 0.4, slowTimer: 3 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.frostRatio).toBeCloseTo(0.6) // 1 - slowFactor: heavier freeze = higher visual intensity
  })

  it('does not show frost after the slow timer expires', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ slowFactor: 0.4, slowTimer: 0 }))

    const scene = projectEnemyScene(game)

    expect(scene.enemies[0]?.frostRatio).toBe(0)
  })
})
