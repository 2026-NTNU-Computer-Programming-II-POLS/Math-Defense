import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy } from '@/entities/types'

interface LaserState {
  targetIds: string[]
  rampTime: number
}

export class MatrixTowerSystem {
  private _lasers = new Map<string, LaserState>()
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.MATRIX_PAIR_CHANGED, ({ towerId, pairId }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (tower) tower.matrixPairId = pairId
        const pair = game.towers.find((t) => t.id === pairId)
        if (pair) pair.matrixPairId = towerId
      }),
      game.eventBus.on(Events.TOWER_PLACED, (tower) => {
        if (tower.type !== TowerType.MATRIX) return
        this._autoPair(tower, game)
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

      const baseDamage = tower.x * pair.x + tower.y * pair.y
      if (baseDamage <= 0) continue

      const overlapRange = Math.min(tower.effectiveRange, pair.effectiveRange)
      const mods = tower.talentMods
      const rampRate = 0.5 * (1 + (mods['damage_ramp'] ?? 0))
      const count = 1 + Math.floor(mods['target_count'] ?? 0)

      const pairKey = [tower.id, pair.id].sort().join(':')
      let laser = this._lasers.get(pairKey)
      if (!laser) {
        laser = { targetIds: [], rampTime: 0 }
        this._lasers.set(pairKey, laser)
      }

      // Remove dead targets from tracking list
      const aliveIds = laser.targetIds.filter(tid =>
        game.enemies.some(e => e.id === tid && e.alive)
      )

      // Acquire new targets up to the talent-modified count
      if (aliveIds.length < count) {
        const existing = new Set(aliveIds)
        const more = this._findOverlapTargets(tower, pair, overlapRange, count, game)
          .filter(t => !existing.has(t.id))
          .slice(0, count - aliveIds.length)
        if (more.length > 0 && aliveIds.length === 0) laser.rampTime = 0
        aliveIds.push(...more.map(t => t.id))
      }
      laser.targetIds = aliveIds

      if (aliveIds.length === 0) continue

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
      if (key.includes(towerId)) return state
    }
    return undefined
  }

  private _autoPair(tower: Tower, game: Game): void {
    let nearest: Tower | null = null
    let nearestDist = Infinity
    for (const other of game.towers) {
      if (other.id === tower.id || other.type !== TowerType.MATRIX) continue
      if (other.matrixPairId) continue
      const d = distance(tower.x, tower.y, other.x, other.y)
      if (d < nearestDist) { nearest = other; nearestDist = d }
    }
    if (nearest) {
      tower.matrixPairId = nearest.id
      nearest.matrixPairId = tower.id
    }
  }

  private _findOverlapTargets(a: Tower, b: Tower, range: number, count: number, game: Game): Enemy[] {
    const candidates: { enemy: Enemy; dist: number }[] = []
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const da = distance(a.x, a.y, enemy.x, enemy.y)
      const db = distance(b.x, b.y, enemy.x, enemy.y)
      if (da > range || db > range) continue
      candidates.push({ enemy, dist: da })
    }
    candidates.sort((x, y) => x.dist - y.dist)
    return candidates.slice(0, count).map(c => c.enemy)
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    if (!enemy.alive) return
    enemy.hp -= amount
    if (enemy.hp <= 0) {
      enemy.hp = 0
      enemy.alive = false
      enemy.active = false
      game.eventBus.emit(Events.ENEMY_KILLED, enemy)
    }
  }

  render(): void {}
}
