/**
 * Per-frame projection of MagicTowerSystem curve state into MagicZoneView
 * snapshots (F-ARCH-4 / FE-5). MagicZoneRenderer consumes these instead of
 * calling MagicTowerSystem.getTowerCurve() directly.
 */
import { TowerType, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import type { MagicZoneView } from './views'

export function projectMagicZones(game: Game): MagicZoneView[] {
  const phase = game.state.phase
  if (phase !== GamePhase.WAVE && phase !== GamePhase.BUILD) return []
  const magicSystem = game.getSystem<MagicTowerSystem>('magicTower')
  if (!magicSystem) return []

  const views: MagicZoneView[] = []
  for (const tower of game.towers) {
    if (tower.type !== TowerType.MAGIC || !tower.configured) continue
    const curve = magicSystem.getTowerCurve(tower)
    if (!curve) continue
    views.push({
      x: tower.x,
      y: tower.y,
      range: tower.effectiveRange,
      mode: tower.magicMode === 'debuff' ? 'debuff' : 'buff',
      curve,
    })
  }
  return views
}
