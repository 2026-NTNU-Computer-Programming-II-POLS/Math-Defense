/**
 * TowerPlacementSystem — 塔的放置（Build Phase）與預覽
 */
import { Events, GamePhase, TowerType } from '@/data/constants'
import { createTower } from '@/entities/TowerFactory'
import { degToRad } from '@/math/MathUtils'
import type { Game } from '@/engine/Game'
import type { Tower, TowerPreview } from '@/entities/types'

export class TowerPlacementSystem {
  /** 當前選擇要放置的塔類型（來自 TowerBar） */
  selectedTowerType: TowerType | null = null

  /** 滑鼠懸停的已放置塔（供預覽） */
  private _hoveredTower: Tower | null = null

  init(game: Game): void {
    // TowerBar 選擇塔類型（透過 uiStore.selectedTowerType 同步，這裡直接監聽 eventBus 自訂事件）
    // GameView 通過 game.eventBus 傳遞選擇的 TowerType
    game.eventBus.on(Events.CANVAS_CLICK, ({ game: gp }) => {
      if (game.state.phase !== GamePhase.BUILD) return
      this._handleClick(Math.round(gp.x), Math.round(gp.y), game)
    })

    game.eventBus.on(Events.CANVAS_HOVER, ({ game: gp }) => {
      const gx = Math.round(gp.x)
      const gy = Math.round(gp.y)
      this._hoveredTower = game.towers.find(
        (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
      ) ?? null
    })
  }

  private _handleClick(gx: number, gy: number, game: Game): void {
    // 點到已有塔 → 選中（開啟 BuildPanel）
    const existing = game.towers.find(
      (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
    )
    if (existing) {
      game.eventBus.emit(Events.TOWER_SELECTED, existing)
      return
    }

    // 放置新塔
    if (!this.selectedTowerType) return

    const tower = createTower(this.selectedTowerType, gx, gy)
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
    this.selectedTowerType = null
  }

  update(_dt: number, _game: Game): void {}

  render(renderer: import('@/engine/Renderer').Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.BUILD) return
    if (this._hoveredTower) {
      this._drawPreview(renderer, this._hoveredTower)
    }
  }

  private _drawPreview(renderer: import('@/engine/Renderer').Renderer, tower: Tower): void {
    const preview = this._getPreview(tower)
    if (preview.type === 'line') {
      renderer.drawFunction(preview.fn, preview.xMin, preview.xMax, tower.color, 1.5)
    } else if (preview.type === 'sector') {
      renderer.drawSector(tower.x, tower.y, preview.radius, preview.startAngle, preview.sweepAngle, tower.color)
    } else if (preview.type === 'integral') {
      renderer.drawIntegralArea(preview.fn, preview.a, preview.b, tower.color)
      renderer.drawFunction(preview.fn, preview.a, preview.b, tower.color, 2)
    }
  }

  private _getPreview(tower: Tower): TowerPreview {
    const p = tower.params as Record<string, number>
    switch (tower.type) {
      case TowerType.FUNCTION_CANNON: {
        if (tower.level >= 2) {
          const a = p.a ?? 0, bCoeff = p.b_coeff ?? 1, c = p.c ?? 0
          return { type: 'line', fn: (x) => a * x * x + bCoeff * x + c, xMin: -3, xMax: 25 }
        }
        const m = p.m ?? 1, b = p.b ?? 0
        return { type: 'line', fn: (x) => m * x + b, xMin: -3, xMax: 25 }
      }
      case TowerType.RADAR_SWEEP: {
        return {
          type: 'sector',
          radius: p.r ?? 4,
          startAngle: degToRad(p.theta ?? 0),
          sweepAngle: degToRad(p.deltaTheta ?? 60),
        }
      }
      case TowerType.INTEGRAL_CANNON: {
        const a = p.a ?? -0.5, b = p.b ?? 3, c = p.c ?? 2
        return {
          type: 'integral',
          fn: (x) => a * x * x + b * x + c,
          a: p.intA ?? 0,
          b: p.intB ?? 6,
        }
      }
      default:
        return { type: 'none' }
    }
  }
}
