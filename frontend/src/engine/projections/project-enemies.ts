/**
 * Per-frame projection of Game.enemies into an EnemySceneView (F-ARCH-4).
 * EnemyRenderer consumes the snapshot rather than reading enemy internals.
 */
import type { Game } from '@/engine/Game'
import type { EnemySceneView, EnemyView } from './views'

export function projectEnemyScene(game: Game): EnemySceneView {
  const enemies: EnemyView[] = []
  for (const e of game.enemies) {
    if (!e.alive) continue
    enemies.push({
      x: e.x,
      y: e.y,
      type: e.type,
      size: e.size,
      color: e.color,
      hpRatio: e.hp < e.maxHp ? e.hp / e.maxHp : null,
      shieldRatio: e.shieldMax > 0 ? e.shield / e.shieldMax : null,
      helperRadius: e.helperRadius,
    })
  }
  return { enemies }
}
