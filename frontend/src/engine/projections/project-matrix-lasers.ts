/**
 * Per-frame projection of MatrixTowerSystem laser state into MatrixLaserPairView
 * snapshots (F-ARCH-4 / FE-5). MatrixLaserRenderer consumes these instead of
 * calling MatrixTowerSystem.getLaserState() directly.
 */
import { TowerType, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import type { MatrixLaserPairView } from './views'

export function projectMatrixLasers(game: Game): MatrixLaserPairView[] {
  if (game.state.phase !== GamePhase.WAVE) return []
  const matrixSystem = game.getSystem<MatrixTowerSystem>('matrixTower')
  if (!matrixSystem) return []

  const views: MatrixLaserPairView[] = []
  const drawn = new Set<string>()

  for (const tower of game.towers) {
    if (tower.type !== TowerType.MATRIX || !tower.matrixPairId) continue
    const pairKey = [tower.id, tower.matrixPairId].sort().join(':')
    if (drawn.has(pairKey)) continue
    drawn.add(pairKey)

    const pair = game.towers.find((t) => t.id === tower.matrixPairId)
    if (!pair) continue

    const laserState = matrixSystem.getLaserState(tower.id)
    if (!laserState || laserState.targetIds.length === 0) {
      views.push({
        towerX: tower.x, towerY: tower.y,
        pairX: pair.x, pairY: pair.y,
        color: tower.color,
        laser: null,
      })
      continue
    }

    const targets: Array<{ x: number; y: number }> = []
    for (const tid of laserState.targetIds) {
      const target = game.enemies.find((e) => e.id === tid && e.alive)
      if (target) targets.push({ x: target.x, y: target.y })
    }

    views.push({
      towerX: tower.x, towerY: tower.y,
      pairX: pair.x, pairY: pair.y,
      color: tower.color,
      laser: targets.length > 0 ? { rampTime: laserState.rampTime, targets } : null,
    })
  }

  return views
}
