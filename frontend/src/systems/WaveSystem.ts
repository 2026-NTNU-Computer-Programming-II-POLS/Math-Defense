/**
 * WaveSystem — 波次管理（TypeScript 版）
 * 敵人以純資料描述（type + overrides），工廠由 EnemyFactory 負責。
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
  private _allSpawned = false

  init(game: Game): void {
    game.eventBus.on(Events.WAVE_START, (waveIndex) => {
      this._startWave(waveIndex as number, game)
    })
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
    this._allSpawned = false
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
    } else {
      this._allSpawned = true
    }

    if (this._allSpawned && game.enemies.length === 0) {
      this._endWave(game)
    }
  }

  private _spawn(config: EnemySpawnEntry, game: Game): void {
    if (!game.pathFunction) return
    const enemy = createEnemy(config.type, game.pathFunction, config.overrides)
    // 詛咒：敵人加速由 MovementSystem 讀取 game.state.enemySpeedMultiplier，不需在此注入
    game.enemies.push(enemy)
    game.eventBus.emit(Events.ENEMY_SPAWNED, enemy)
  }

  private _endWave(game: Game): void {
    game.eventBus.emit(Events.WAVE_END, game.state.wave)

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
