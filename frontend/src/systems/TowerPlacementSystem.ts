/**
 * TowerPlacementSystem — tower placement (Build Phase) and preview
 */
import { Events, GamePhase, TowerType } from '@/data/constants'
import { createTower } from '@/entities/TowerFactory'
import { degToRad, findIntersections, gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { Game } from '@/engine/Game'
import { getParam } from '@/entities/types'
import type { Tower, TowerPreview } from '@/entities/types'

/**
 * Handles tower placement (Build phase) and the hover-preview overlay.
 *
 * **Setup contract:** after `new TowerPlacementSystem()` the caller MUST wire
 * `getSelectedTowerType` and `clearSelectedTowerType` BEFORE the first
 * CANVAS_CLICK fires (typically inside `useGameLoop` immediately after
 * construction). The defaults are no-ops: forgetting this wiring silently
 * disables tower placement rather than throwing.
 */
export class TowerPlacementSystem {
  /** Tower-type reader injected from outside (set by useGameLoop) */
  getSelectedTowerType: () => TowerType | null = () => null
  clearSelectedTowerType: () => void = () => {}

  /** The placed tower currently under the mouse cursor (used for preview) */
  private _hoveredTower: Tower | null = null
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    // Clear any prior subscriptions so HMR / re-init doesn't double-subscribe.
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.CANVAS_CLICK, ({ game: gp }) => {
        if (game.state.phase !== GamePhase.BUILD) return
        this._handleClick(Math.round(gp.x), Math.round(gp.y), game)
      }),

      game.eventBus.on(Events.CANVAS_HOVER, ({ game: gp }) => {
        const gx = Math.round(gp.x)
        const gy = Math.round(gp.y)
        this._hoveredTower = game.towers.find(
          (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
        ) ?? null
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  private _handleClick(gx: number, gy: number, game: Game): void {
    // clicked an existing tower → select it (open BuildPanel)
    const existing = game.towers.find(
      (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
    )
    if (existing) {
      game.eventBus.emit(Events.TOWER_SELECTED, existing)
      return
    }

    // place a new tower
    const selectedType = this.getSelectedTowerType()
    if (!selectedType) return

    const tower = createTower(selectedType, gx, gy)
    const cost = game.state.freeTowerNext ? 0 : tower.cost
    if (game.state.gold < cost) return

    const occupied = game.towers.some(
      (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
    )
    if (occupied) return

    game.towers.push(tower)
    game.changeGold(-cost)
    if (game.state.freeTowerNext) game.state.freeTowerNext = false

    game.eventBus.emit(Events.TOWER_PLACED, tower)
    this.clearSelectedTowerType()
  }

  update(_dt: number, _game: Game): void {}

  render(renderer: import('@/engine/Renderer').Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.BUILD) return
    if (this._hoveredTower) {
      this._drawPreview(renderer, this._hoveredTower, game)
    }
  }

  private _drawPreview(
    renderer: import('@/engine/Renderer').Renderer,
    tower: Tower,
    game: Game,
  ): void {
    const preview = this._getPreview(tower)
    if (preview.type === 'line') {
      renderer.drawFunction(preview.fn, preview.xMin, preview.xMax, tower.color, 1.5)
      // FUNCTION_CANNON projectiles fly in a straight line from the tower to
      // each intersection of `shotFn` with the path, not along `shotFn`
      // itself. Overlay the actual trajectories so the preview matches what
      // the player will see when the wave starts.
      if (tower.type === TowerType.FUNCTION_CANNON && game.pathFunction) {
        this._drawShotTrajectories(renderer, tower, preview.fn, game.pathFunction)
      }
    } else if (preview.type === 'sector') {
      // The sector radius already has rangeBonus baked in by _getPreview.
      renderer.drawSector(tower.x, tower.y, preview.radius, preview.startAngle, preview.sweepAngle, tower.color)
    } else if (preview.type === 'integral') {
      renderer.drawIntegralArea(preview.fn, preview.a, preview.b, tower.color)
      renderer.drawFunction(preview.fn, preview.a, preview.b, tower.color, 2)
    }
  }

  private _drawShotTrajectories(
    renderer: import('@/engine/Renderer').Renderer,
    tower: Tower,
    shotFn: (x: number) => number,
    pathFn: (x: number) => number,
  ): void {
    const intersections = findIntersections(shotFn, pathFn, -3, 25)
    if (intersections.length === 0) return
    const { ctx } = renderer
    const tpx = gameToCanvasX(tower.x)
    const tpy = gameToCanvasY(tower.y)
    ctx.save()
    ctx.strokeStyle = tower.color
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    for (const xi of intersections) {
      const yi = shotFn(xi)
      ctx.beginPath()
      ctx.moveTo(tpx, tpy)
      ctx.lineTo(gameToCanvasX(xi), gameToCanvasY(yi))
      ctx.stroke()
    }
    ctx.restore()
  }

  private _getPreview(tower: Tower): TowerPreview {
    switch (tower.type) {
      case TowerType.FUNCTION_CANNON: {
        if (tower.level >= 2) {
          const a = getParam(tower, 'a', 0)
          const bCoeff = getParam(tower, 'b_coeff', 1)
          const c = getParam(tower, 'c', 0)
          return { type: 'line', fn: (x) => a * x * x + bCoeff * x + c, xMin: -3, xMax: 25 }
        }
        const m = getParam(tower, 'm', 1)
        const b = getParam(tower, 'b', 0)
        return { type: 'line', fn: (x) => m * x + b, xMin: -3, xMax: 25 }
      }
      case TowerType.RADAR_SWEEP: {
        // Mirror the rangeBonus applied inside CombatSystem so the preview
        // sector matches the actual damage area after a range buff/curse.
        return {
          type: 'sector',
          radius: getParam(tower, 'r', 4) * tower.rangeBonus,
          startAngle: degToRad(getParam(tower, 'theta', 0)),
          sweepAngle: degToRad(getParam(tower, 'deltaTheta', 60)),
        }
      }
      case TowerType.INTEGRAL_CANNON: {
        const a = getParam(tower, 'a', -0.5)
        const b = getParam(tower, 'b', 3)
        const c = getParam(tower, 'c', 2)
        // Mirror the integration-window scaling from CombatSystem.
        const rawA = getParam(tower, 'intA', 0)
        const rawB = getParam(tower, 'intB', 6)
        const mid = (rawA + rawB) / 2
        const half = ((rawB - rawA) / 2) * tower.rangeBonus
        return {
          type: 'integral',
          fn: (x) => a * x * x + b * x + c,
          a: mid - half,
          b: mid + half,
        }
      }
      default:
        return { type: 'none' }
    }
  }
}
