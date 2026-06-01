/**
 * useGlobalMusic — app-wide background music driver.
 *
 * Mounted once at the root (App.vue), it keeps the menu playlist
 * (PLAYLIST_SLUGS) rotating across every screen EXCEPT an active game
 * session, where the engine's BUILD/WAVE phase beds (useEngineAudio) own the
 * music bus instead. On every other route — menus, level select, leaderboard,
 * replay/spectate, profile — the playlist plays continuously.
 *
 * Coordination is route-driven and lock-free: both this playlist and the
 * engine phase beds share AssetManager's single bed map, and starting any bed
 * cross-fades the others out. So leaving /game, the playlist restarts and the
 * (now-fading) phase bed yields automatically; entering /game, suspending the
 * playlist hands the bus to the phase bed.
 *
 * Like useEngineAudio it bridges the uiStore volume / mute prefs so the music
 * obeys the same sliders even on screens that never wire a game engine.
 */
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { assetManager } from '@/engine/audio/AssetManager'
import { PLAYLIST_SLUGS } from '@/engine/audio/sfx-defs'
import { useUiStore } from '@/stores/uiStore'

// Route names where the engine owns the music bus. Only `/game` plays phase
// music; replay/spectate drive the engine but wire no audio, so the playlist
// is welcome there as ambient backing.
const ENGINE_MUSIC_ROUTES: ReadonlySet<string> = new Set(['game'])

export function useGlobalMusic(): void {
  const route = useRoute()
  const uiStore = useUiStore()

  // Idempotent preload — resolves immediately if a game session already
  // primed the asset pool.
  void assetManager.load()

  // Bridge audio prefs → AssetManager. immediate:true seeds persisted values
  // before the first track fires (mirrors useEngineAudio's master/music/mute
  // watchers; the sfx/ui buses are bridged by the engine when in a session).
  watch(() => uiStore.audioVolume, (v) => assetManager.setVolume(v), { immediate: true })
  watch(() => uiStore.audioMuted, (m) => assetManager.mute(m), { immediate: true })
  watch(() => uiStore.audioVolumeMusic, (v) => assetManager.setBusVolume('music', v), { immediate: true })

  // Suspend on game routes, (re)start everywhere else. immediate:true seeds
  // the initial route so a direct load onto a menu screen starts the playlist
  // (queued until the first user gesture by the AssetManager unlock path).
  watch(
    () => route.name,
    (name) => {
      if (name != null && ENGINE_MUSIC_ROUTES.has(String(name))) {
        assetManager.stopPlaylist()
      } else {
        assetManager.startPlaylist(PLAYLIST_SLUGS)
      }
    },
    { immediate: true },
  )
}
