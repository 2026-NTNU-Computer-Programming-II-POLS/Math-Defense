import { Events, GamePhase } from '@/data/constants'
import type { TowerType } from '@/data/constants'
import { createTower } from '@/entities/TowerFactory'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'
import { computeLegalPositions, type LegalPositionSet } from '@/domain/placement/legal-positions'
import { isGeneratedLevelContext } from '@/engine/generated-level-context'

export class TowerPlacementSystem {
  getSelectedTowerType: () => TowerType | null = () => null
  clearSelectedTowerType: () => void = () => {}

  private _hoveredTower: Tower | null = null
  private _hoveredCell: { gx: number; gy: number } | null = null
  private _unsubs: (() => void)[] = []
  private _legalPositions: LegalPositionSet | null = null

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.CANVAS_CLICK, ({ game: gp }) => {
        if (game.state.phase !== GamePhase.BUILD) return
        this._handleClick(Math.round(gp.x), Math.round(gp.y), game)
      }),

      game.eventBus.on(Events.CANVAS_HOVER, ({ game: gp }) => {
        if (game.state.phase !== GamePhase.BUILD) {
          this._hoveredTower = null
          this._hoveredCell = null
          return
        }
        const gx = Math.round(gp.x)
        const gy = Math.round(gp.y)
        this._hoveredTower = game.towers.find(
          (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
        ) ?? null
        this._hoveredCell = { gx, gy }
      }),

      game.eventBus.on(Events.PHASE_CHANGED, ({ to }) => {
        if (to !== GamePhase.BUILD) {
          this._hoveredTower = null
          this._hoveredCell = null
        }
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        this._legalPositions = null
        const ctx = game.levelContext
        if (ctx) {
          if (isGeneratedLevelContext(ctx)) {
            this._legalPositions = computeLegalPositions({
              paths: ctx.paths,
              decoyCells: ctx.decoyCells,
            })
          } else {
            this._legalPositions = computeLegalPositions(ctx.path)
          }
        }
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._legalPositions = null
  }

  private _handleClick(gx: number, gy: number, game: Game): void {
    const existing = game.towers.find(
      (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
    )
    if (existing) {
      game.eventBus.emit(Events.TOWER_SELECTED, existing)
      return
    }

    const selectedType = this.getSelectedTowerType()
    if (!selectedType) return
    if (!game.levelContext) return

    if (!this._legalPositions || !this._legalPositions.has(gx, gy)) {
      game.eventBus.emit(Events.PLACEMENT_REJECTED, { gx, gy, reason: 'not-buildable' })
      return
    }

    const isOccupied = game.towers.some(
      (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
    )
    if (isOccupied) {
      game.eventBus.emit(Events.PLACEMENT_REJECTED, { gx, gy, reason: 'occupied' })
      return
    }

    const mods = game.towerModifierProvider?.(selectedType) ?? {}
    const tower = createTower(selectedType, gx, gy, mods)
    const cost = game.state.freeTowerNext ? 0 : tower.cost

    if (game.state.gold < cost) {
      game.eventBus.emit(Events.PLACEMENT_REJECTED, { gx, gy, reason: 'insufficient-gold' })
      return
    }

    this._commitPlacement(tower, cost, game)
  }

  private _commitPlacement(tower: Tower, cost: number, game: Game): void {
    game.towers.push(tower)
    game.changeGold(-cost)
    if (game.state.freeTowerNext) game.state.freeTowerNext = false

    game.eventBus.emit(Events.TOWER_PLACED, tower)
    this.clearSelectedTowerType()
  }

  update(_dt: number, _game: Game): void {}

  render(renderer: import('@/engine/Renderer').Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.BUILD) return

    if (this._hoveredTower) return

    if (
      game.levelContext
      && this._hoveredCell
      && this.getSelectedTowerType() !== null
    ) {
      const { gx, gy } = this._hoveredCell
      const isLegal = this._legalPositions?.has(gx, gy) ?? false
      const isOccupied = game.towers.some(
        (t) => Math.round(t.x) === gx && Math.round(t.y) === gy,
      )
      const cls = isOccupied ? 'forbidden' as const : isLegal ? 'buildable' as const : 'forbidden' as const
      renderer.drawPlacementCursor(gx, gy, cls)
    }
  }
}
