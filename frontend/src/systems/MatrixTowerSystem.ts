import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy } from '@/entities/types'

interface LaserState {
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

      const pairKey = [tower.id, pair.id].sort().join(':')
      let laser = this._lasers.get(pairKey)
      if (!laser) {
        laser = { targetIds: [], rampTime: 0, invalid: false }
        this._lasers.set(pairKey, laser)
      }

      const baseDamage = tower.x * pair.x + tower.y * pair.y
      if (baseDamage <= 0) {
        laser.invalid = true
        laser.targetIds = []
        continue
      }
      laser.invalid = false

      const mods = tower.talentMods
      const upgradeRamp = tower.upgradeExtras?.['rampRate'] ?? 0
      const rampRate = 0.5 * (1 + (mods['damage_ramp'] ?? 0) + upgradeRamp)
      const count = 1 + Math.floor(mods['target_count'] ?? 0) + Math.floor(tower.upgradeExtras?.['targetCount'] ?? 0)

      // Remove dead targets from tracking list
      const aliveIds = laser.targetIds.filter(tid =>
        game.enemies.some(e => e.id === tid && e.alive)
      )

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
      if (other.matrixPairId) continue
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
    if (!enemy.alive) return

    let remaining = amount * game.state.enemyVulnerability
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, remaining)
      enemy.shield -= absorbed
      remaining -= absorbed
    }
    if (remaining > 0) {
      enemy.hp -= remaining
    }

    if (enemy.hp <= 0) {
      enemy.hp = 0
      enemy.alive = false
      enemy.active = false
      game.eventBus.emit(Events.ENEMY_KILLED, enemy)
      if (shouldSplit(enemy) && game.levelContext?.path) {
        spawnChildren(enemy, {
          path: game.levelContext.path,
          onChildCreated: (child) => {
            game.enemies.push(child)
            game.eventBus.emit(Events.ENEMY_SPAWNED, child)
          },
        })
      }
    }
  }

  render(): void {}
}
