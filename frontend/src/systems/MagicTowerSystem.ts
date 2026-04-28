import { Events, GamePhase, TowerType } from '@/data/constants'
import { generateMagicCandidates, type CurveFunction } from '@/domain/tower/magic-candidates'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

const ZONE_WIDTH = 1.5

export class MagicTowerSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.MAGIC_FUNCTION_SELECTED, ({ towerId, index }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower || tower.type !== TowerType.MAGIC) return
        const candidates = this.getCandidates(tower)
        if (index < 0 || index >= candidates.length) return
        tower.magicFunctionIndex = index
        tower.configured = true
      }),
      game.eventBus.on(Events.MAGIC_MODE_CHANGED, ({ towerId, mode }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (tower && tower.type === TowerType.MAGIC) {
          tower.magicMode = mode
        }
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  getCandidates(tower: Tower) {
    return generateMagicCandidates(tower.id, tower.x, tower.y)
  }

  getTowerCurve(tower: Tower): CurveFunction | null {
    const idx = tower.magicFunctionIndex ?? -1
    if (idx < 0) return null
    const candidates = this.getCandidates(tower)
    return candidates[idx]?.fn ?? null
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Reset transient magic buff from last frame before any buff tower fires.
    for (const t of game.towers) {
      if (t.magicBuff !== 1) {
        t.magicBuff = 1
        t.effectiveDamage = t.baseDamage * t.damageBonus
      }
    }

    for (const tower of game.towers) {
      if (tower.type !== TowerType.MAGIC || tower.disabled || !tower.configured) continue
      if (tower.magicFunctionIndex === undefined || tower.magicFunctionIndex < 0) continue

      tower.cooldownTimer -= dt
      if (tower.cooldownTimer > 0) continue
      tower.cooldownTimer = tower.cooldown

      const fn = this.getTowerCurve(tower)
      if (!fn) continue

      if (tower.magicMode === 'debuff') {
        this._applyDebuff(tower, fn, game)
      } else {
        this._applyBuff(tower, fn, game)
      }
    }
  }

  private _applyDebuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const dotDuration = 1.0 * (1 + (mods['duration'] ?? 0))
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const curveY = fn(enemy.x)
      if (Math.abs(enemy.y - curveY) < zoneWidth) {
        enemy.slowFactor = Math.max(enemy.slowFactor, 0.4)
        enemy.dotDamage = tower.effectiveDamage * strengthMult
        enemy.dotTimer = dotDuration
      }
    }
  }

  private _applyBuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const buffAmount = 1.25 * strengthMult
    for (const other of game.towers) {
      if (other.id === tower.id || other.disabled) continue
      const curveY = fn(other.x)
      if (Math.abs(other.y - curveY) < zoneWidth * 2) {
        other.magicBuff = Math.max(other.magicBuff, buffAmount)
        other.effectiveDamage = other.baseDamage * other.damageBonus * other.magicBuff
      }
    }
  }

  render(): void {}
}
