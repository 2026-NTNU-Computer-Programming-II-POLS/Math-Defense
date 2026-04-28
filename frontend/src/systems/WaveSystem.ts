import { Events, GamePhase } from '@/data/constants'
import { createEnemy } from '@/entities/EnemyFactory'
import {
  isGeneratedLevelContext,
  type SpawnDescriptor,
} from '@/engine/generated-level-context'
import type { Game } from '@/engine/Game'
import type { EnemySpawnEntry } from '@/data/level-defs'
import type { SegmentedPath } from '@/domain/path/segmented-path'

export class WaveSystem {
  private _spawnQueue: EnemySpawnEntry[] = []
  private _spawnTimer = 0
  private _spawnInterval = 1.0
  private _spawnIndex = 0
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.WAVE_START, (waveIndex) => {
        this._startWave(waveIndex as number, game)
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  private _startWave(waveIndex: number, game: Game): void {
    const waves = game.currentWaves
    if (!waves) return

    const waveDef = waves[waveIndex - 1]
    if (!waveDef) return

    game.state.totalWaves = waves.length
    this._spawnQueue = [...waveDef.enemies]
    this._spawnInterval = waveDef.spawnInterval
    this._spawnTimer = this._spawnInterval
    this._spawnIndex = 0
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    if (this._spawnQueue.length > 0) {
      this._spawnTimer -= dt
      if (this._spawnTimer <= 0) {
        const config = this._spawnQueue.shift()!
        this._spawn(config, game)
        this._spawnTimer = this._spawnInterval
      }
      return
    }

    if (game.enemies.length === 0) {
      this._endWave(game)
    }
  }

  private _pickSpawn(game: Game): SpawnDescriptor | { path: SegmentedPath; spawn: null; targetX: number } | null {
    const ctx = game.levelContext
    if (!ctx) return null
    if (isGeneratedLevelContext(ctx)) {
      if (ctx.spawns.length === 0) return null
      const idx = this._spawnIndex++ % ctx.spawns.length
      return ctx.spawns[idx]!
    }
    // V1 piecewise levels: use the single legacy path; spawn at its
    // path.startX with target = path.targetX (createEnemy default).
    return { path: ctx.path, spawn: null, targetX: ctx.path.targetX }
  }

  private _spawn(config: EnemySpawnEntry, game: Game): void {
    const picked = this._pickSpawn(game)
    if (!picked) {
      console.warn('[WaveSystem] spawn skipped: no path available', { type: config.type })
      return
    }
    const { path, targetX } = picked
    const startX = picked.spawn ? picked.spawn.x : path.startX
    const enemy = createEnemy(config.type, path, startX, targetX)
    game.assignEnemyPath(enemy.id, path)
    game.enemies.push(enemy)
    game.eventBus.emit(Events.ENEMY_SPAWNED, enemy)
  }

  private _endWave(game: Game): void {
    const s = game.state
    game.eventBus.emit(Events.WAVE_END, Object.freeze({
      wave: s.wave,
      gold: s.gold,
      hp: s.hp,
      score: s.score,
      killValue: s.cumulativeKillValue,
      costTotal: s.costTotal,
    }))

    if (game.state.wave >= game.state.totalWaves) {
      game.eventBus.emit(Events.LEVEL_END, undefined)
      game.setPhase(GamePhase.LEVEL_END)
    } else {
      const montyHall = game.getSystem('montyHall')
      if (montyHall && montyHall.triggerPendingEvent(game)) {
        return
      }
      game.setPhase(GamePhase.BUILD)
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
