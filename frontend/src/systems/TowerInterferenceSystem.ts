import { Events, GamePhase, TowerType } from '@/data/constants'
import { recomputeEffectiveDamage } from '@/entities/tower-stats'
import type { Game, GameSystem } from '@/engine/Game'

// First-pass tuning (Phase 7 §7.3 / README §9). Same-type towers packed
// within INTERFERENCE_RADIUS lose PER_NEIGHBOR_PENALTY of their damage per
// neighbour, down to INTERFERENCE_FLOOR:
//   1 neighbour → 0.85, 2 → 0.70, 3 → 0.55, 4+ → 0.40
const INTERFERENCE_RADIUS = 2.5
const PER_NEIGHBOR_PENALTY = 0.15
const INTERFERENCE_FLOOR = 0.4

/**
 * The affected-type scope (Decision D2). Initialised to all seven tower
 * types — the shipped default is "interference applies to everything". Kept
 * as data so narrowing the scope after playtest stays a one-line change; a
 * type absent from this set always reports `interferenceFactor === 1`.
 */
export const INTERFERING_TOWER_TYPES: ReadonlySet<TowerType> = new Set<TowerType>([
  TowerType.MAGIC,
  TowerType.RADAR_A,
  TowerType.RADAR_B,
  TowerType.RADAR_C,
  TowerType.MATRIX,
  TowerType.LIMIT,
  TowerType.CALCULUS,
])

/**
 * TowerInterferenceSystem — soft cap on same-type tower spam (Phase 7).
 *
 * Each WAVE frame (and once on TOWER_PLACED / TOWER_REMOVED /
 * TOWER_REFUND_RESULT so the BUILD-phase preview stays correct) it counts
 * same-type neighbours within INTERFERENCE_RADIUS, derives each tower's
 * `interferenceFactor`, and refreshes `effectiveDamage` through the canonical
 * `recomputeEffectiveDamage` helper.
 *
 * Ordering dependency (§7.3): registered BEFORE MagicTowerSystem in
 * register-systems.ts so the interference factor for the frame is set before
 * the magic buff is folded in. Both systems write effectiveDamage only via
 * `recomputeEffectiveDamage`, so they agree on the canonical value with no
 * flicker or double-application.
 */
export class TowerInterferenceSystem implements GameSystem {
  private _unsubs: (() => void)[] = []
  // Towers never change during WAVE, so a recompute is only needed once after
  // the tower layout is finalised (WAVE_START) or changed (TOWER_* events).
  private _dirty = true

  init(game: Game): void {
    this.destroy()
    const setDirty = () => { this._dirty = true }
    this._unsubs.push(
      game.eventBus.on(Events.TOWER_PLACED, () => { this._dirty = true; this._recomputeAll(game) }),
      game.eventBus.on(Events.TOWER_REMOVED, () => { this._dirty = true; this._recomputeAll(game) }),
      game.eventBus.on(Events.TOWER_REFUND_RESULT, () => { this._dirty = true; this._recomputeAll(game) }),
      game.eventBus.on(Events.WAVE_START, setDirty),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  update(_dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return
    if (!this._dirty) return
    this._dirty = false
    this._recomputeAll(game)
  }

  private _recomputeAll(game: Game): void {
    const towers = game.towers
    const radiusSq = INTERFERENCE_RADIUS * INTERFERENCE_RADIUS

    for (const tower of towers) {
      let factor = 1
      if (INTERFERING_TOWER_TYPES.has(tower.type)) {
        let neighbours = 0
        for (const other of towers) {
          if (other.id === tower.id || other.type !== tower.type) continue
          const dx = other.x - tower.x
          const dy = other.y - tower.y
          if (dx * dx + dy * dy <= radiusSq) neighbours++
        }
        factor = Math.max(INTERFERENCE_FLOOR, 1 - PER_NEIGHBOR_PENALTY * neighbours)
      }
      tower.interferenceFactor = factor
      recomputeEffectiveDamage(tower)
    }
  }
}
