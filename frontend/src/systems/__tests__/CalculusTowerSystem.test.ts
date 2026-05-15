/**
 * V3 Phase 1 — de-fear the Calculus tower. A degenerate operation (the
 * monomial collapses to 0 or to a constant) must never remove or disable the
 * tower; it falls back to the minimal f(x) = x and the operation is free.
 */
import { describe, it, expect } from 'vitest'
import { CalculusTowerSystem, CALCULUS_OP_COST } from '../CalculusTowerSystem'
import { Events, TowerType } from '@/data/constants'
import type { CalculusState } from '@/entities/types'
import { createMockGame, createMockTower } from './helpers'

function makeCalcState(over?: Partial<CalculusState>): CalculusState {
  return { coefficient: 3, exponent: 1, currentExpr: '3x', opApplied: false, ...over }
}

describe('CalculusTowerSystem — V3 de-fear', () => {
  it('keeps the tower alive when an operation collapses the coefficient to 0', () => {
    const game = createMockGame()
    const sys = new CalculusTowerSystem()
    sys.init(game)

    // derivative2 of 3x → 3·1·0 = 0 coefficient → collapse.
    const tower = createMockTower({ type: TowerType.CALCULUS, calculusState: makeCalcState() })
    game.towers.push(tower)

    game.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: tower.id, operation: 'derivative2' })

    expect(game.towers).toContain(tower)
    expect(tower.disabled).toBe(false)
    expect(tower.calculusState).toEqual({
      coefficient: 1,
      exponent: 1,
      currentExpr: 'x',
      opApplied: false,
    })

    sys.destroy()
  })

  it('keeps the tower alive when an operation collapses the exponent to 0', () => {
    const game = createMockGame()
    const sys = new CalculusTowerSystem()
    sys.init(game)

    // derivative of 3x → 3x^0, exponent 0 → collapse.
    const tower = createMockTower({ type: TowerType.CALCULUS, calculusState: makeCalcState() })
    game.towers.push(tower)

    game.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: tower.id, operation: 'derivative' })

    expect(game.towers).toContain(tower)
    expect(tower.disabled).toBe(false)
    expect(tower.calculusState?.currentExpr).toBe('x')

    sys.destroy()
  })

  it('does not deduct gold for a collapsed chain operation (free retry)', () => {
    const game = createMockGame({ gold: 200 })
    const sys = new CalculusTowerSystem()
    sys.init(game)

    // opApplied = true → this is a chain op, normally charged CALCULUS_OP_COST.
    const tower = createMockTower({
      type: TowerType.CALCULUS,
      calculusState: makeCalcState({ opApplied: true }),
    })
    game.towers.push(tower)

    game.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: tower.id, operation: 'derivative' })

    expect(game.state.gold).toBe(200)
    expect(game.state.costTotal).toBe(0)
    // A collapse does not advance the chain.
    expect(tower.calculusState?.opApplied).toBe(true)

    sys.destroy()
  })

  it('still charges a chain operation that succeeds', () => {
    const game = createMockGame({ gold: 200 })
    const sys = new CalculusTowerSystem()
    sys.init(game)

    // 3x^3, opApplied = true → derivative → 9x^2 (a valid, non-degenerate op).
    const tower = createMockTower({
      type: TowerType.CALCULUS,
      calculusState: makeCalcState({ coefficient: 3, exponent: 3, currentExpr: '3x^3', opApplied: true }),
    })
    game.towers.push(tower)

    game.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: tower.id, operation: 'derivative' })

    expect(game.state.gold).toBe(200 - CALCULUS_OP_COST)
    expect(game.state.costTotal).toBe(CALCULUS_OP_COST)
    expect(tower.calculusState).toMatchObject({ coefficient: 9, exponent: 2, opApplied: true })

    sys.destroy()
  })
})
