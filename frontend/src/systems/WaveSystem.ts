/**
 * WaveSystem — wave management (TypeScript)
 * Enemies are described as pure `{ type }` data; EnemyFactory handles
 * instantiation. Per-enemy start/target x comes from defaults today; a
 * future "spawn-at-segment" hook plugs in here without touching callers.
 */
import { Events, GamePhase } from '@/data/constants'
import { LEVELS } from '@/data/level-defs'
import { createEnemy } from '@/entities/EnemyFactory'
import type { Game } from '@/engine/Game'
import type { EnemySpawnEntry } from '@/data/level-defs'

export class WaveSystem {
  private _spawnQueue: EnemySpawnEntry[] = []
  private _spawnTimer = 0
  private _spawnInterval = 1.0
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    // Clear any prior subscriptions so HMR / re-init doesn't double-subscribe.
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
    const levelDef = LEVELS.find((l) => l.id === game.state.level)
    if (!levelDef) return

    const waveDef = levelDef.waves[waveIndex - 1]
    if (!waveDef) return

    game.state.totalWaves = levelDef.waves.length
    this._spawnQueue = [...waveDef.enemies]
    this._spawnInterval = waveDef.spawnInterval
    this._spawnTimer = this._spawnInterval
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Spawn phase: if we still have enemies queued, tick the spawn timer and
    // possibly spawn one this frame — but do NOT evaluate the end-condition
    // in the same tick. Otherwise the very last spawn (or a SplitSlime child
    // created from an enemy killed this tick) could race with the check and
    // leak combat into BUFF_SELECT with enemies still live.
    if (this._spawnQueue.length > 0) {
      this._spawnTimer -= dt
      if (this._spawnTimer <= 0) {
        const config = this._spawnQueue.shift()!
        this._spawn(config, game)
        this._spawnTimer = this._spawnInterval
      }
      return
    }

    // End phase: only reachable after a tick with no spawn activity.
    if (game.enemies.length === 0) {
      this._endWave(game)
    }
  }

  private _spawn(config: EnemySpawnEntry, game: Game): void {
    if (!game.pathFunction) {
      // Path cleared mid-wave — skip this spawn but log so it's visible in dev.
      // Silent skip would manifest as a wave that "ends" without all enemies appearing.
      console.warn('[WaveSystem] spawn skipped: pathFunction is null', { type: config.type })
      return
    }
    const enemy = createEnemy(config.type, game.pathFunction)
    // curse: enemy speed-up is read by MovementSystem from game.state.enemySpeedMultiplier — no injection needed here
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
    }))

    if (game.state.wave >= game.state.totalWaves) {
      game.eventBus.emit(Events.LEVEL_END, undefined)
      game.setPhase(GamePhase.LEVEL_END)
    } else {
      game.setPhase(GamePhase.BUFF_SELECT)
      game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
