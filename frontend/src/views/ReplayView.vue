<script setup lang="ts">
/**
 * ReplayView — Pedagogical Backlog §24 Replay UI.
 *
 * Rebuilds the engine from the persisted (seed, star_rating, event log) for
 * a finished session and lets the viewer scrub through the run. NOT the
 * spectator path (Phase D streams events live); this view targets a fully
 * recorded session.
 *
 * Determinism contract: rerunning the same seed + event log must produce
 * the same final score within ε = 0.0005 (spec §24.5). The actual check
 * isn't done in this view — it's done by the determinism unit test —
 * but the UI surfaces the recorded final score side-by-side with the live
 * playback score so divergence is visible to the player.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { Game } from '@/engine/Game'
import { mulberry32 } from '@/math/MathUtils'
import { generateLevel, generateLevelDeterministicFromSeed } from '@/domain/level/level-generator'
import { initWasm, isUsingWasm, whenWasmReady } from '@/math/WasmBridge'
import { buildWavesForStar } from '@/data/wave-generator'
import { sessionService, type ReplayBundleOut } from '@/services/sessionService'
import { EventPlayer } from '@/engine/replay/EventPlayer'

import { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import { CombatSystem } from '@/systems/CombatSystem'
import { MovementSystem } from '@/systems/MovementSystem'
import { WaveSystem } from '@/systems/WaveSystem'
import { BuffSystem } from '@/systems/BuffSystem'
import { EconomySystem } from '@/systems/EconomySystem'
import { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import { RadarTowerSystem } from '@/systems/RadarTowerSystem'
import { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import { CalculusTowerSystem, PetCombatSystem } from '@/systems/CalculusTowerSystem'
import { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import { EnemyAbilitySystem } from '@/systems/EnemyAbilitySystem'
import { SpellSystem } from '@/systems/SpellSystem'
import { MontyHallSystem } from '@/systems/MontyHallSystem'
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import { createGeneratedLevelContext } from '@/engine/generated-level-context'
import { Events } from '@/data/constants'

const route = useRoute()
const router = useRouter()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const bundle = ref<ReplayBundleOut | null>(null)
const loadError = ref<string | null>(null)
const ready = ref(false)
const liveScore = ref(0)
const cursor = ref(0)
const totalEvents = ref(0)
const playState = ref<'idle' | 'playing' | 'paused' | 'ended'>('idle')

let game: Game | null = null
let player: EventPlayer | null = null
let unsubScore: (() => void) | null = null

const sessionId = computed(() => String(route.params.sessionId ?? ''))

/** Progress 0..1 used by the scrub-bar visual. */
const progress = computed(() => {
  if (totalEvents.value === 0) return 0
  return cursor.value / totalEvents.value
})

async function boot(): Promise<void> {
  loadError.value = null
  try {
    bundle.value = await sessionService.getReplay(sessionId.value)
    totalEvents.value = bundle.value.events.length
    if (bundle.value.rng_seed === null) {
      // Pre-§24 sessions have no seed. We still play the events for the
      // timeline, but warn the player that randomness will diverge.
      console.warn('[Replay] session has no rng_seed — RNG-driven events will diverge')
    }
    // construction plan §3.8 — v2 replays must run through the WASM determinism
    // module. Kick off the load (idempotent — initWasm uses a singleton
    // promise) and await it before wiring the engine. v1 replays don't
    // need WASM but tolerate it loading in the background.
    if ((bundle.value.replay_version ?? 1) === 2) {
      const ok = await initWasm()
      if (!ok || !isUsingWasm()) {
        loadError.value = 'This recording requires the bit-exact replay engine. ' +
          'It could not be loaded in this browser — please try Chrome, Firefox, ' +
          'or Safari (recent versions).'
        return
      }
    } else {
      // Best-effort: warm the cache. wireEngine handles either outcome.
      await whenWasmReady().catch(() => false)
    }
    await wireEngine()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function wireEngine(): Promise<void> {
  const canvas = canvasRef.value
  const b = bundle.value
  if (!canvas || !b) return

  const g = new Game(canvas)
  game = g

  // Seed BEFORE startLevel so LEVEL_START handlers see the seeded RNG
  // (Backlog §24 determinism foundation).
  const seed = b.rng_seed ?? Date.now()
  g.setSeed(seed)

  // Re-generate the level deterministically from the same seed. The level
  // generator is pure on (starRating, rng), so a fresh stream from the
  // same seed reproduces the exact GeneratedLevel that the live run saw.
  // construction plan §3.8: v2 sessions go through the WASM determinism path so
  // every browser produces a bit-identical level; v1 stays on the JS path
  // (mulberry32 + Math.* — within ε = 0.0005).
  let generatedLevel
  if ((b.replay_version ?? 1) === 2) {
    const v2Level = generateLevelDeterministicFromSeed(b.star_rating, seed)
    if (!v2Level) {
      loadError.value = 'Level could not be regenerated from the recorded seed (WASM v2 path).'
      return
    }
    generatedLevel = v2Level
  } else {
    const levelRng = mulberry32(seed)
    generatedLevel = generateLevel(b.star_rating, levelRng)
  }
  g.generatedLevel = generatedLevel
  g.currentWaves = buildWavesForStar(b.star_rating)

  // Wire systems (mirror useGameLoop's order). We omit session-sync,
  // achievement toasts, and audio because none of those make sense in a
  // historical replay.
  g.addSystem('placement', new TowerPlacementSystem())
  g.addSystem('enemyAbility', new EnemyAbilitySystem())
  g.addSystem('combat', new CombatSystem())
  g.addSystem('movement', new MovementSystem())
  g.addSystem('wave', new WaveSystem())
  g.addSystem('buff', new BuffSystem())
  g.addSystem('economy', new EconomySystem())
  g.addSystem('magicTower', new MagicTowerSystem())
  g.addSystem('radarTower', new RadarTowerSystem())
  g.addSystem('matrixTower', new MatrixTowerSystem())
  g.addSystem('limitTower', new LimitTowerSystem())
  g.addSystem('calculusTower', new CalculusTowerSystem())
  g.addSystem('petCombat', new PetCombatSystem())
  g.addSystem('towerUpgrade', new TowerUpgradeSystem())
  g.addSystem('spell', new SpellSystem())
  g.addSystem('montyHall', new MontyHallSystem())
  g.addSystem('enemyRenderer', new EnemyRenderer())
  g.addSystem('towerRenderer', new TowerRenderer())
  g.addSystem('projectileRenderer', new ProjectileRenderer())

  // Bridge LEVEL_START so the level context is created before systems read
  // it (mirrors useGameLoop's setup minus the audio + session bits).
  g.eventBus.on(Events.LEVEL_START, () => {
    g.levelContext?.dispose()
    g.levelContext = createGeneratedLevelContext(generatedLevel, g.eventBus)
  })

  // Mirror score for the HUD overlay so the viewer can see the live
  // simulation score climb back to the recorded final score.
  unsubScore = g.eventBus.on(Events.SCORE_CHANGED, (score) => {
    liveScore.value = score
  })

  g.startLevel(b.star_rating)

  player = new EventPlayer(g, b.events, {
    onEventDispatched: () => {
      cursor.value = player?.cursor ?? cursor.value
      playState.value = player?.state ?? playState.value
    },
  })

  ready.value = true
}

function play(): void {
  if (!player) return
  player.play()
  playState.value = 'playing'
}

function pause(): void {
  if (!player) return
  player.pause()
  playState.value = 'paused'
}

function exit(): void {
  router.push({ name: 'menu' }).catch(() => { /* swallow */ })
}

watch(playState, (s) => {
  if (s === 'ended') {
    // Finished — pause the engine so the canvas freezes on the final frame.
    game?.stop()
  }
})

onMounted(() => { void boot() })

onBeforeUnmount(() => {
  player?.destroy()
  player = null
  unsubScore?.()
  unsubScore = null
  game?.destroy()
  game = null
})
</script>

<template>
  <div class="replay-view">
    <header class="replay-header">
      <h1>Session Replay</h1>
      <button class="btn-ghost" @click="exit">Exit</button>
    </header>

    <div v-if="loadError" class="boot-state error" role="alert">
      <p>{{ loadError }}</p>
    </div>
    <div v-else-if="!ready" class="boot-state" role="status" aria-live="polite">
      <p>Loading replay…</p>
    </div>

    <div v-show="ready" class="replay-stage">
      <canvas
        ref="canvasRef"
        class="replay-canvas"
        role="img"
        aria-label="Replay canvas"
      />
    </div>

    <footer v-if="ready" class="replay-controls" role="toolbar" aria-label="Replay controls">
      <button v-if="playState !== 'playing'" class="btn" @click="play">▶ Play</button>
      <button v-else class="btn" @click="pause">❚❚ Pause</button>
      <div class="scrub" :aria-valuenow="cursor" :aria-valuemax="totalEvents" role="progressbar">
        <div class="scrub-bar" :style="{ width: (progress * 100) + '%' }" />
      </div>
      <div class="meta">
        <span>{{ cursor }} / {{ totalEvents }} events</span>
        <span>·</span>
        <span>Score: {{ liveScore }}</span>
        <span v-if="bundle?.rng_seed === null" class="warn" role="status">
          (no seed — RNG events will diverge)
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.replay-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--stone-dark);
  color: var(--text-primary);
}
.replay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--grid-line);
}
.replay-header h1 {
  font-size: 1.1rem;
  margin: 0;
  color: var(--gold-bright);
}
.replay-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.replay-canvas {
  max-width: 100%;
  max-height: 100%;
  background: var(--stone-light);
}
.replay-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--grid-line);
}
.scrub {
  flex: 1;
  height: 8px;
  background: var(--stone-light);
  border-radius: 4px;
  overflow: hidden;
}
.scrub-bar {
  height: 100%;
  background: var(--gold-bright);
  transition: width 0.08s linear;
}
.meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--axis);
}
.warn { color: var(--hp-red); }
.btn {
  padding: 0.4rem 0.9rem;
  background: var(--tower-cannon);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-ghost {
  padding: 0.4rem 0.9rem;
  background: transparent;
  color: var(--axis);
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  cursor: pointer;
}
.boot-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.boot-state.error { color: var(--hp-red); }
</style>
