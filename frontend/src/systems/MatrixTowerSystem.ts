import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy } from '@/entities/types'

export interface LaserState {
  targetIds: string[]
  rampTime: number
  invalid: boolean
}

export class MatrixTowerSystem {
  private _lasers = new Map<string, LaserState>()
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.MATRIX_PAIR_CHANGED, ({ towerId, pairId }) => {
        for (const id of [towerId, pairId]) {
          const staleKey = [...this._lasers.keys()].find(k => { const [a, b] = k.split(':'); return a === id || b === id })
          if (staleKey) this._lasers.delete(staleKey)
        }
        // Set `configured` on both towers, not just the panel-clicked one:
        // `configured` is the update-loop firing gate, and a paired tower must
        // fire regardless of which side initiated the pairing. Without this the
        // engine relies on the Vue panel's side-effect to mark the clicked
        // tower, leaving the partner ungated for any non-panel emitter (replay,
        // tests, future code).
        const tower = game.towers.find((t) => t.id === towerId)
        if (tower) { tower.matrixPairId = pairId; tower.configured = true }
        const pair = game.towers.find((t) => t.id === pairId)
        if (pair) { pair.matrixPairId = towerId; pair.configured = true }
      }),
      game.eventBus.on(Events.TOWER_PLACED, (tower) => {
        if (tower.type !== TowerType.MATRIX) return
        this._autoPair(tower, game)
      }),
      game.eventBus.on(Events.TOWER_REFUND_RESULT, ({ towerId, success }) => {
        if (!success || !towerId) return
        for (const key of [...this._lasers.keys()]) {
          const [a, b] = key.split(':')
          if (a === towerId || b === towerId) this._lasers.delete(key)
        }
        const partner = game.towers.find(t => t.matrixPairId === towerId)
        if (partner) partner.matrixPairId = null
      }),
      game.eventBus.on(Events.LEVEL_START, () => {
        this._lasers.clear()
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._lasers.clear()
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    const processed = new Set<string>()
    for (const tower of game.towers) {
      if (tower.type !== TowerType.MATRIX || tower.disabled || !tower.configured) continue
      if (processed.has(tower.id)) continue
      const pairId = tower.matrixPairId
      if (!pairId) continue
      const pair = game.towers.find((t) => t.id === pairId)
      if (!pair || pair.disabled) continue

      processed.add(tower.id)
      processed.add(pair.id)

      const pairKey = [tower.id, pair.id].sort().join(':')
      let laser = this._lasers.get(pairKey)
      if (!laser) {
        laser = { targetIds: [], rampTime: 0, invalid: false }
        this._lasers.set(pairKey, laser)
      }

      // Dot-product mechanic: damage = 1 (base) + dot product. Strongly negative
      // dot products (opposite quadrants) still deactivate the laser; the +1 base
      // lets pairs near the origin still contribute small damage.
      const dotProduct = tower.x * pair.x + tower.y * pair.y
      const rawBase = 1 + dotProduct
      if (rawBase <= 0) {
        laser.invalid = true
        laser.targetIds = []
        continue
      }
      laser.invalid = false

      const mods = tower.talentMods
      // Phase 7 (Q14): `resonance` is a multiplicative bonus on the paired
      // base damage. Applied *after* the rawBase > 0 gate so it never
      // resurrects an opposite-quadrant pair.
      const resonanceMod = 1 + (mods['resonance'] ?? 0)
      // Same-type interference soft cap (Phase 7 §7.3): MATRIX is listed in
      // INTERFERING_TOWER_TYPES, so TowerInterferenceSystem computes a
      // per-tower interferenceFactor each WAVE frame. Every other tower type
      // respects the cap implicitly through `effectiveDamage`; this system uses
      // a custom damage formula and so must fold it in explicitly. The laser is
      // the joint product of both paired towers, so apply the average of the
      // two factors.
      const interferenceMod = (tower.interferenceFactor + pair.interferenceFactor) / 2
      const baseDamage = rawBase * resonanceMod * interferenceMod
      const upgradeRamp = tower.upgradeExtras?.['rampRate'] ?? 0
      const rampRate = 0.5 * (1 + (mods['damage_ramp'] ?? 0) + upgradeRamp)
      const count = 1 + Math.floor(mods['target_count'] ?? 0) + Math.floor(tower.upgradeExtras?.['targetCount'] ?? 0)

      // Drop targets that died OR left the firing zone. Acquisition requires
      // the enemy to sit inside BOTH towers' ranges (_findOverlapTargets), so
      // the lock holds to that same overlap: a target that walks out of either
      // tower's range is released, freeing the slot for a fresh in-zone enemy.
      const aliveIds = laser.targetIds.filter(tid => {
        const e = game.enemies.find(en => en.id === tid && en.alive)
        if (!e) return false
        return distance(tower.x, tower.y, e.x, e.y) <= tower.effectiveRange
          && distance(pair.x, pair.y, e.x, e.y) <= pair.effectiveRange
      })

      // Acquire new targets up to the talent-modified count
      if (aliveIds.length < count) {
        const existing = new Set(aliveIds)
        const more = this._findOverlapTargets(tower, pair, count, game)
          .filter(t => !existing.has(t.id))
          .slice(0, count - aliveIds.length)
        if (more.length > 0 && aliveIds.length === 0) laser.rampTime = 0
        aliveIds.push(...more.map(t => t.id))
      }
      laser.targetIds = aliveIds

      // No targets in the firing zone → reset the ramp so the readout (and the
      // next lock) start from ×1 instead of resuming a stale charge. The
      // fresh-acquisition reset above still handles same-frame target swaps.
      if (aliveIds.length === 0) {
        laser.rampTime = 0
        continue
      }

      laser.rampTime += dt
      const rampMultiplier = 1 + laser.rampTime * rampRate
      const dmg = baseDamage * rampMultiplier * dt

      for (const tid of aliveIds) {
        const target = game.enemies.find(e => e.id === tid && e.alive)
        if (target) this._dealDamage(target, dmg, game)
      }
    }
  }

  getLaserState(towerId: string): LaserState | undefined {
    for (const [key, state] of this._lasers) {
      const [a, b] = key.split(':')
      if (a === towerId || b === towerId) return state
    }
    return undefined
  }

  private _autoPair(tower: Tower, game: Game): void {
    let nearest: Tower | null = null
    let nearestDist = Infinity
    for (const other of game.towers) {
      if (other.id === tower.id || other.type !== TowerType.MATRIX) continue
      if (other.matrixPairId || other.disabled) continue
      const d = distance(tower.x, tower.y, other.x, other.y)
      if (d < nearestDist) { nearest = other; nearestDist = d }
    }
    if (nearest) {
      tower.matrixPairId = nearest.id
      nearest.matrixPairId = tower.id
      tower.configured = true
      nearest.configured = true
    }
  }

  private _findOverlapTargets(a: Tower, b: Tower, count: number, game: Game): Enemy[] {
    const candidates: { enemy: Enemy; dist: number }[] = []
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const da = distance(a.x, a.y, enemy.x, enemy.y)
      const db = distance(b.x, b.y, enemy.x, enemy.y)
      if (da > a.effectiveRange || db > b.effectiveRange) continue
      candidates.push({ enemy, dist: da })
    }
    candidates.sort((x, y) => x.dist - y.dist)
    return candidates.slice(0, count).map(c => c.enemy)
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    // The Matrix laser is continuous, dt-scaled damage; routing it through
    // 'towerTick' keeps any future discrete-only modifier (e.g. the cap
    // mechanic kept on Enemy.damageCapPerHit for potential reuse) from
    // biting it. Bulwark's towerDamageMult still applies here.
    applyDamage(enemy, amount, game, 'towerTick')
  }

}
