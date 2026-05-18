/**
 * Per-frame projection of Game.towers + scene chrome into a TowerSceneView
 * (F-ARCH-4). The TowerRenderer consumes the result instead of reading
 * tower / game internals.
 */
import { GamePhase, ANIM, TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { seedFor } from '@/math/seededRandom'
import { selectRadarTargets, radarTargetCount } from '@/domain/combat/RadarTargeting'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy } from '@/entities/types'
import type { TowerSceneView, TowerView } from './views'

function nearestEnemyAngle(tower: Tower, enemies: ReadonlyArray<Enemy>): number | null {
  let best: Enemy | null = null
  let bestDist = Infinity
  const r = tower.effectiveRange
  for (const e of enemies) {
    if (!e.alive) continue
    const dx = e.x - tower.x
    const dy = e.y - tower.y
    const d = Math.hypot(dx, dy)
    if (d > r) continue
    if (d < bestDist) { bestDist = d; best = e }
  }
  if (!best) return null
  // Cosmetic-only: visual angle for the telescope to track, not gameplay
  // RNG — outside the determinism contract per renderer convention.
  return Math.atan2(best.y - tower.y, best.x - tower.x)
}

// Radar B/C barrels must point at the enemy RadarTowerSystem would actually
// shoot — same selector, so the barrel cannot diverge from the projectile
// (matches the dashed bore-sight line in RadarRangeRenderer).
function radarPrimaryTargetAngle(tower: Tower, enemies: ReadonlyArray<Enemy>): number | null {
  const targets = selectRadarTargets(tower, enemies as Enemy[], radarTargetCount(tower))
  if (targets.length === 0) return null
  const t = targets[0]
  return Math.atan2(t.y - tower.y, t.x - tower.x)
}

// Matrix bracket cells scroll at a steady cosmetic rate; per-cell phase
// offset comes from seedFor so adjacent Matrix towers never tick in unison.
const MATRIX_CELL_RATE = 2.5
function matrixCells(tower: Tower, time: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    const seed = seedFor(`matrix-cell-${tower.id}-${i}`, tower.x, tower.y)
    out.push(Math.floor((time * MATRIX_CELL_RATE + seed * 10)) % 10)
  }
  return out
}

export function projectTowerScene(game: Game): TowerSceneView {
  const phase = game.state.phase
  const towers: TowerView[] = game.towers.map((t) => {
    // Visual Redesign Phase 5b/5e — aim tracking is consumed by the Radar B
    // / Radar C telescope rotation and by the Calculus tower's `dx`/`dy`
    // shed-particle aim vector. Cosmetic only.
    const isRadar = t.type === TowerType.RADAR_B || t.type === TowerType.RADAR_C
    const tracks = isRadar || t.type === TowerType.CALCULUS
    return {
      x: t.x,
      y: t.y,
      type: t.type,
      color: t.color,
      configured: t.configured,
      disabled: t.disabled,
      glyph: TOWER_DEFS[t.type].glyph,
      // Surface as `ANIM.TOWER_FIRE_FLASH` (i.e. "fully aged out") when unset
      // so the renderer's age-based fade reads zero intensity without needing
      // a nullable branch on the view.
      firingFlashAge: t.firingFlashAge ?? ANIM.TOWER_FIRE_FLASH,
      level: t.level,
      idleSeed: seedFor(`tower-idle-${t.id}`, t.x, t.y),
      arcStart: t.arcStart ?? 0,
      arcEnd: t.arcEnd ?? Math.PI / 2,
      aimAngle: tracks
        ? (isRadar ? radarPrimaryTargetAngle(t, game.enemies) : nearestEnemyAngle(t, game.enemies))
        : null,
      matrixCells: t.type === TowerType.MATRIX ? matrixCells(t, game.time) : null,
    }
  })
  return {
    phase,
    cursor: game.hud.keyboardCursor === null
      ? null
      : { gx: game.hud.keyboardCursor.gx, gy: game.hud.keyboardCursor.gy },
    towers,
    showCoords: phase === GamePhase.BUILD,
  }
}
