/**
 * useEngineAudio — wires AssetManager to engine SFX triggers + uiStore
 * volume / mute prefs (F-ARCH-5, Pedagogical Backlog §15.3-§15.4).
 *
 * Returns the unsubscribe handles so the parent composable adds them to its
 * teardown bag — the audio bridge intentionally does not run its own
 * onUnmounted hook so retry() can rebind cleanly without a fresh component
 * mount.
 *
 * Event coverage map (extended audio pass):
 *   SPELL_CAST            → cast-spell        (player spell trigger)
 *   ENEMY_KILLED          → kill              (jittered)
 *   WAVE_END              → wave-end
 *   MONTY_HALL_RESULT     → mh-reveal
 *   PHASE_CHANGED         → ambient-build / ambient-wave crossfade
 *   TOWER_PLACED          → tower-place
 *   TOWER_UPGRADED        → tower-upgrade
 *   TOWER_REFUND_RESULT*  → tower-refund (success only)
 *   BUFF_EXPIRED          → buff-expire      (timed buff countdown hit zero)
 *   TOWER_SELECTED        → tower-select (throttled, ignore null deselect)
 *   TOWER_ATTACK          → tower-attack-light (heavy-throttled + jittered)
 *   ENEMY_SPAWNED         → enemy-spawn / boss-spawn (boss override)
 *   ENEMY_REACHED_ORIGIN  → enemy-reached (HP warning)
 *   WAVE_START            → wave-start
 *   LEVEL_END             → level-victory
 *   GAME_OVER             → game-over
 *   PLACEMENT_REJECTED    → ui-cancel
 *
 * Heavy-tower distinction is per-tower-type — STRONG and bosses' chain-rule
 * towers fire the heavy variant. Pet attacks reuse the light variant.
 */
import { watch, type Ref } from 'vue'
import { Events, GamePhase, TowerType, EnemyType } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { assetManager } from '@/engine/audio/AssetManager'
import { useUiStore } from '@/stores/uiStore'

export interface AchievementAudioRef {
  /** Source ref watched for newly-unlocked achievements (length > 0 plays a chime). */
  newlyUnlockedAchievements: Ref<ReadonlyArray<{ id: string }>>
}

// MATRIX and CALCULUS are the heavy hitters — large AOE / slow fire-rate
// archetypes get the deeper attack sample. The fast-firing arc-radars and
// MAGIC pulses use the lighter, jittered pew so a row of three radars
// doesn't sound like artillery.
const HEAVY_TOWERS: ReadonlySet<string> = new Set<string>([TowerType.MATRIX, TowerType.CALCULUS])
const BOSS_TYPES: ReadonlySet<string> = new Set<string>([EnemyType.BOSS_A, EnemyType.BOSS_B])

export function bindEngineAudio(g: Game, audio: AchievementAudioRef): (() => void)[] {
  const uiStore = useUiStore()
  const offs: (() => void)[] = []

  // §15.4 — kick off the asset preload. Lazy so the first wireEngine pass
  // triggers /audio/* fetches; subsequent retries reuse the cached pool.
  void assetManager.load()

  // Stop ONLY the engine's own phase beds — never the global menu playlist
  // (useGlobalMusic). Using stopAllMusic() here would kill the playlist track
  // that useGlobalMusic restarts the instant the route leaves /game, before
  // GameView's onUnmounted teardown fires.
  const stopEngineMusic = (): void => {
    assetManager.stop('ambient-build')
    assetManager.stop('ambient-wave')
  }

  // ─── Spell / kill / wave-end ───────────────────────────────────────────
  offs.push(g.eventBus.on(Events.SPELL_CAST, () => assetManager.play('cast-spell')))
  offs.push(g.eventBus.on(Events.ENEMY_KILLED, () => assetManager.play('kill')))
  offs.push(g.eventBus.on(Events.WAVE_END, () => assetManager.play('wave-end')))
  offs.push(g.eventBus.on(Events.MONTY_HALL_RESULT, () => assetManager.play('mh-reveal')))

  // ─── Phase music: BUILD vs. WAVE crossfade ────────────────────────────
  offs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ to }) => {
    if (to === GamePhase.BUILD) assetManager.play('ambient-build')
    else if (to === GamePhase.WAVE) assetManager.play('ambient-wave')
    else stopEngineMusic()
  }))
  // Singleton music survives engine teardown — without this cleanup the bed
  // keeps playing after the player leaves GameView, and also persists across
  // retry() between teardown and the next phase transition.
  offs.push(stopEngineMusic)

  // ─── Build / economy feedback ─────────────────────────────────────────
  offs.push(g.eventBus.on(Events.TOWER_PLACED, () => assetManager.play('tower-place')))
  offs.push(g.eventBus.on(Events.TOWER_UPGRADED, () => assetManager.play('tower-upgrade')))
  offs.push(g.eventBus.on(Events.TOWER_REFUND_RESULT, ({ success }) => {
    if (success) assetManager.play('tower-refund')
  }))
  offs.push(g.eventBus.on(Events.BUFF_EXPIRED, () => assetManager.play('buff-expire')))
  // Selection: ignore the deselect (null) edge — only the human's pick-up
  // gesture should click. Throttle is enforced inside AssetManager.
  offs.push(g.eventBus.on(Events.TOWER_SELECTED, (t) => {
    if (t) assetManager.play('tower-select')
  }))
  offs.push(g.eventBus.on(Events.PLACEMENT_REJECTED, () => assetManager.play('ui-cancel')))

  // ─── Combat attacks ──────────────────────────────────────────────────
  // TOWER_ATTACK fires every projectile launch. AssetManager throttles &
  // jitters; we just pick the heavy/light variant based on tower type.
  offs.push(g.eventBus.on(Events.TOWER_ATTACK, ({ tower }) => {
    const slug = HEAVY_TOWERS.has(tower.type) ? 'tower-attack-heavy' : 'tower-attack-light'
    assetManager.play(slug)
  }))

  // ─── Enemy lifecycle ─────────────────────────────────────────────────
  offs.push(g.eventBus.on(Events.ENEMY_SPAWNED, (enemy) => {
    if (BOSS_TYPES.has(enemy.type)) assetManager.play('boss-spawn')
    else assetManager.play('enemy-spawn')
  }))
  offs.push(g.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => assetManager.play('enemy-reached')))

  // ─── Flow ────────────────────────────────────────────────────────────
  offs.push(g.eventBus.on(Events.WAVE_START, () => assetManager.play('wave-start')))
  offs.push(g.eventBus.on(Events.LEVEL_END, () => assetManager.play('level-victory')))
  offs.push(g.eventBus.on(Events.GAME_OVER, () => assetManager.play('game-over')))

  // Achievement-unlock SFX: piggy-back on the ref AchievementToast already
  // watches so we don't need a parallel event channel.
  offs.push(watch(audio.newlyUnlockedAchievements, (list) => {
    if (list && list.length > 0) assetManager.play('achievement')
  }))

  // §15.3 — bridge uiStore audio prefs → AssetManager. immediate:true seeds
  // the initial state so a muted / volume value persisted from a previous
  // session is honoured before any SFX fires.
  offs.push(watch(() => uiStore.audioVolume, (v) => assetManager.setVolume(v), { immediate: true }))
  offs.push(watch(() => uiStore.audioMuted, (m) => assetManager.mute(m), { immediate: true }))
  offs.push(watch(() => uiStore.audioVolumeMusic, (v) => assetManager.setBusVolume('music', v), { immediate: true }))
  offs.push(watch(() => uiStore.audioVolumeSfx, (v) => assetManager.setBusVolume('sfx', v), { immediate: true }))
  offs.push(watch(() => uiStore.audioVolumeUi, (v) => assetManager.setBusVolume('ui', v), { immediate: true }))

  return offs
}
