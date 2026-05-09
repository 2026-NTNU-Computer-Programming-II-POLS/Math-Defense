/**
 * Per-frame projection of Game.towers + scene chrome into a TowerSceneView
 * (F-ARCH-4). The TowerRenderer consumes the result instead of reading
 * tower / game internals.
 */
import { GamePhase } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import type { Game } from '@/engine/Game'
import type { TowerSceneView, TowerView } from './views'

export function projectTowerScene(game: Game): TowerSceneView {
  const phase = game.state.phase
  const towers: TowerView[] = game.towers.map((t) => ({
    x: t.x,
    y: t.y,
    type: t.type,
    color: t.color,
    configured: t.configured,
    disabled: t.disabled,
    glyph: TOWER_DEFS[t.type].glyph,
  }))
  return {
    phase,
    cursor: game.keyboardCursor === null
      ? null
      : { gx: game.keyboardCursor.gx, gy: game.keyboardCursor.gy },
    towers,
    showCoords: phase === GamePhase.BUILD,
  }
}
