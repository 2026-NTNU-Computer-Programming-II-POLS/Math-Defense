/**
 * useEngineAudio — wires AssetManager to engine SFX triggers + uiStore
 * volume / mute prefs (F-ARCH-5, Pedagogical Backlog §15.3-§15.4).
 *
 * Returns the unsubscribe handles so the parent composable adds them to its
 * teardown bag — the audio bridge intentionally does not run its own
 * onUnmounted hook so retry() can rebind cleanly without a fresh component
 * mount.
 */
import { watch, type Ref } from 'vue'
import { Events, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import { assetManager } from '@/engine/audio/AssetManager'
import { useUiStore } from '@/stores/uiStore'

export interface AchievementAudioRef {
  /** Source ref watched for newly-unlocked achievements (length > 0 plays a chime). */
  newlyUnlockedAchievements: Ref<ReadonlyArray<{ id: string }>>
}

export function bindEngineAudio(g: Game, audio: AchievementAudioRef): (() => void)[] {
  const uiStore = useUiStore()
  const offs: (() => void)[] = []

  // §15.4 — kick off the asset preload. Lazy so the first wireEngine pass
  // triggers /audio/*.mp3 fetches; subsequent retries reuse the cached pool.
  void assetManager.load()

  // Player-facing spell trigger lives on SPELL_CAST (emitted from SpellBar).
  // CAST_SPELL is an internal tower-cast event with much higher fire rate.
  offs.push(g.eventBus.on(Events.SPELL_CAST, () => assetManager.play('cast-spell')))
  offs.push(g.eventBus.on(Events.ENEMY_KILLED, () => assetManager.play('kill')))
  offs.push(g.eventBus.on(Events.WAVE_END, () => assetManager.play('wave-end')))
  offs.push(g.eventBus.on(Events.MONTY_HALL_RESULT, () => assetManager.play('mh-reveal')))
  offs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ from, to }) => {
    if (to === GamePhase.BUILD) assetManager.play('ambient-build')
    else if (from === GamePhase.BUILD) assetManager.stop('ambient-build')
  }))
  // Singleton ambient survives engine teardown — without this cleanup the
  // BUILD-phase loop keeps playing after the player leaves GameView, and
  // also persists across retry() between teardown and the next phase
  // transition that would have stopped it organically.
  offs.push(() => assetManager.stop('ambient-build'))

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

  return offs
}
