/**
 * Per-frame projection of Game.enemies into an EnemySceneView (F-ARCH-4).
 * EnemyRenderer consumes the snapshot rather than reading enemy internals.
 */
import { ANIM } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { EnemySceneView, EnemyView } from './views'

export function projectEnemyScene(game: Game): EnemySceneView {
  const enemies: EnemyView[] = []
  for (const e of game.enemies) {
    // Include dying enemies in the view so the corpse / death-particle
    // renderer can paint them through the animation window. Skip enemies
    // that are neither alive nor dying (defensive — MovementSystem should
    // splice these out next tick).
    if (!e.alive && !e.dying) continue

    const frostRatio = e.slowTimer > 0 && e.slowFactor > 0
      ? Math.max(0, Math.min(1, e.slowFactor))
      : 0

    const maxAge = e.deathMaxTime ?? ANIM.ENEMY_DEATH
    const dyingProgress = e.dying && maxAge > 0
      ? Math.max(0, Math.min(1, (e.dyingTimer ?? 0) / maxAge))
      : 0
    const hitFlashAge = e.hitFlashAge ?? 0

    enemies.push({
      x: e.x,
      y: e.y,
      type: e.type,
      size: e.size,
      color: e.color,
      frostRatio,
      hpRatio: e.hp < e.maxHp ? e.hp / e.maxHp : null,
      shieldRatio: e.shieldMax > 0 ? e.shield / e.shieldMax : null,
      helperRadius: e.helperRadius,
      regenerating: e.regenPerSec > 0 && e.hp < e.maxHp,
      dyingProgress,
      hitFlashAge,
    })
  }
  return { enemies }
}
