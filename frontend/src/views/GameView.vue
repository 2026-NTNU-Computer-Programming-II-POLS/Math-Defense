<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useGameLoop } from '@/composables/useGameLoop'
import { GamePhase } from '@/data/constants'
import { formatScore } from '@/domain/formatters'

import HUD from '@/components/game/HUD.vue'
import TowerBar from '@/components/game/TowerBar.vue'
import BuildPanel from '@/components/game/BuildPanel.vue'
import BuildHint from '@/components/game/BuildHint.vue'
import BuffCardPanel from '@/components/game/BuffCardPanel.vue'
import ShopPanel from '@/components/game/ShopPanel.vue'
import MontyHallPanel from '@/components/game/MontyHallPanel.vue'
import ScoreResultView from '@/views/ScoreResultView.vue'
import ChainRulePanel from '@/components/game/ChainRulePanel.vue'
import StartWaveButton from '@/components/game/StartWaveButton.vue'
import Modal from '@/components/common/Modal.vue'
import AchievementToast from '@/components/game/AchievementToast.vue'

const router = useRouter()
const gameStore = useGameStore()
const uiStore = useUiStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Read generated level + IA result forwarded via history state from InitialAnswerView.
const _rawLevel = history.state?.level as string | undefined
const _rawIa = history.state?.iaResult as string | undefined
const _generatedLevel = _rawLevel
  ? (() => { try { return JSON.parse(_rawLevel) } catch { return null } })()
  : null
const _iaResult = (_rawIa === 'correct' || _rawIa === 'wrong' || _rawIa === 'paid' || _rawIa === 'ignored')
  ? _rawIa
  : null
const _rawTerritoryCtx = history.state?.territoryContext as string | undefined
const _territoryContext = _rawTerritoryCtx
  ? (() => { try { return JSON.parse(_rawTerritoryCtx) as { activityId: string; slotId: string } } catch { return null } })()
  : null

const { game, ready, loadError, retry, newlyUnlockedAchievements, lastCompletedSessionId } = useGameLoop(canvasRef, {
  generatedLevel: _generatedLevel,
  iaResult: _iaResult,
})

function navigateHome(): void {
  router.push({ name: 'menu' }).catch((err) => {
    console.warn('[GameView] Navigation failed:', err)
  })
}

function navigateAfterGame(): void {
  if (_territoryContext && lastCompletedSessionId.value) {
    router.push({
      name: 'territory-play',
      params: { id: _territoryContext.activityId, slotId: _territoryContext.slotId },
      state: { sessionId: lastCompletedSessionId.value },
    }).catch((err) => {
      console.warn('[GameView] Territory navigation failed:', err)
    })
  } else {
    navigateHome()
  }
}

function navigateAfterLoss(): void {
  if (_territoryContext) {
    router.push({
      name: 'territory-detail',
      params: { id: _territoryContext.activityId },
    }).catch((err) => {
      console.warn('[GameView] Territory-detail navigation failed:', err)
    })
  } else {
    navigateHome()
  }
}

// Warn before navigating away mid-game (progress would be lost).
// beforeEnter on the game route already blocks entry without level data,
// so _generatedLevel is always non-null here.
onBeforeRouteLeave(() => {
  const activePhases: GamePhase[] = [GamePhase.WAVE, GamePhase.BUILD, GamePhase.BUFF_SELECT, GamePhase.CHAIN_RULE]
  if (activePhases.includes(gameStore.phase)) {
    return window.confirm('Leave the game? Your current progress will be lost.')
  }
})

// Screen-reader live announcement (A-6). Phase transitions and HP drops are
// conveyed visually only; mirror them into a polite aria-live region so
// assistive tech users get parity without spamming announcements.
const liveMessage = ref('')
const prevHp = ref<number>(gameStore.hp)

function announce(msg: string): void {
  // Reassigning with the same value won't re-announce — toggle via empty string
  // tick before setting, so consecutive identical messages still fire.
  liveMessage.value = ''
  void nextTick(() => { liveMessage.value = msg })
}

watch(() => gameStore.phase, (phase) => {
  switch (phase) {
    case GamePhase.BUILD:       announce(`Build phase, wave ${gameStore.wave + 1} ready`); break
    case GamePhase.WAVE:        announce(`Wave ${gameStore.wave} started`); break
    case GamePhase.BUFF_SELECT: announce('Buff selection'); break
    case GamePhase.CHAIN_RULE:  announce('Chain rule challenge'); break
    case GamePhase.LEVEL_END:   announce('Victory'); break
    case GamePhase.GAME_OVER:   announce('Game over'); break
  }
})

watch(() => gameStore.hp, (hp) => {
  if (hp < prevHp.value) {
    if (hp <= 0) announce('Hit points depleted')
    else if (hp <= 5 && prevHp.value > 5) announce(`Warning, hit points critical: ${hp}`)
  }
  prevHp.value = hp
})

watch(() => gameStore.phase, (phase) => {
  if (phase === GamePhase.GAME_OVER) {
    uiStore.showModal(
      'Game Over',
      `Survived ${gameStore.wave} waves · Score: ${formatScore(gameStore.score)}`,
      navigateAfterLoss,
    )
  }
})

// U-1: pause / resume. The game loop is owned by the engine via
// `Game.start/stop` which already cancels its RAF cleanly. Pausing outside
// the WAVE phase is meaningless (BUILD and BUFF_SELECT don't advance the
// simulation on their own) so we gate the toggle on WAVE to avoid stale
// paused state leaking into a subsequent wave.
const paused = ref(false)
function togglePause(): void {
  const g = game.value
  if (!g) return
  if (gameStore.phase !== GamePhase.WAVE) {
    if (paused.value) { g.start(); paused.value = false }
    return
  }
  if (paused.value) {
    g.start()
    paused.value = false
    announce('Resumed')
  } else {
    g.stop()
    paused.value = true
    announce('Paused')
  }
}

function onKeydown(e: KeyboardEvent): void {
  // Ignore when the player is editing a numeric input etc., so digit entry
  // in the Build Panel isn't hijacked by Space.
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault()
    togglePause()
  }
}

// Auto-resume on phase leave so a paused BUFF_SELECT / LEVEL_END can't
// trap the loop in stop().
watch(() => gameStore.phase, (phase) => {
  if (phase !== GamePhase.WAVE && paused.value) {
    game.value?.start()
    paused.value = false
  }
})

// Responsive scaling (audit C-5). The engine/canvas are authored against a
// fixed 1280×720 world, so rather than redoing layout math everywhere, we
// uniformly scale the whole view via CSS transform. Internal coordinates,
// pointer mapping (browsers account for CSS transforms), and DPR handling in
// `Renderer` all stay untouched.
const shellRef = ref<HTMLDivElement | null>(null)

function calcScale(W: number, H: number) {
  const pad = 2
  const s = Math.min(1, (W - pad * 2) / 1280, (H - pad * 2) / 720)
  return { s, ox: Math.floor((W - 1280 * s) / 2), oy: Math.floor((H - 720 * s) / 2) }
}

const _init = calcScale(window.innerWidth, window.innerHeight)
const scale = ref(_init.s)
const offsetX = ref(_init.ox)
const offsetY = ref(_init.oy)

function recomputeScale(): void {
  const shell = shellRef.value
  if (!shell) return
  const { s, ox, oy } = calcScale(shell.clientWidth, shell.clientHeight)
  scale.value = s
  offsetX.value = ox
  offsetY.value = oy
}

let ro: ResizeObserver | null = null

onMounted(() => {
  recomputeScale()
  const shell = shellRef.value
  if (shell) {
    ro = new ResizeObserver(recomputeScale)
    ro.observe(shell)
  }
  window.addEventListener('resize', recomputeScale)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  window.removeEventListener('resize', recomputeScale)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="shellRef" class="game-shell">
    <!-- R-5: on portrait phones the 1280×720 world scales down to an
         unusably small strip. Ask the user to rotate — the rest of the
         game stays rendered underneath so landscape resumes instantly. -->
    <div class="rotate-hint" role="alert">
      <div class="rotate-icon" aria-hidden="true">⟳</div>
      <p>Rotate your device to landscape for the best experience.</p>
    </div>

    <!-- K-2: loading state while WASM / engine boot. Sits at shell level so
         the spinner isn't shrunk by the 1280×720 scale transform below. -->
    <div v-if="!ready && !loadError" class="boot-state loading" role="status" aria-live="polite">
      <div class="boot-spinner" aria-hidden="true" />
      <p class="boot-msg">Loading math engine…</p>
    </div>

    <!-- K-3: load-error surface with retry. -->
    <div v-else-if="loadError" class="boot-state error" role="alert">
      <h3 class="boot-title">Engine failed to load</h3>
      <p class="boot-msg">{{ loadError }}</p>
      <button class="btn" @click="retry">Retry</button>
    </div>
    <div
      class="game-view"
      :style="{ transform: `scale(${scale})`, left: `${offsetX}px`, top: `${offsetY}px` }"
    >
    <canvas
      ref="canvasRef"
      class="game-canvas"
      role="img"
      aria-label="Math Defense game canvas — place towers and start waves using the overlay controls"
    />

    <!-- Off-screen live region for screen readers (A-6) -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ liveMessage }}
    </div>

    <div v-if="ready" class="game-overlay">
      <AchievementToast :achievements="newlyUnlockedAchievements" />
      <HUD />
      <BuildHint />

      <!-- Build Phase -->
      <template v-if="gameStore.isBuilding">
        <TowerBar />
        <BuildPanel v-if="uiStore.buildPanelVisible" />
        <ShopPanel />
        <StartWaveButton />
      </template>

      <!-- Buff Select (V1 compat) -->
      <BuffCardPanel v-if="gameStore.isBuff" />

      <!-- Monty Hall Event -->
      <MontyHallPanel v-if="gameStore.isMontyHall" />

      <!-- Score Result (Victory) -->
      <ScoreResultView
        v-if="gameStore.phase === GamePhase.LEVEL_END"
        @close="navigateAfterGame"
      />

      <!-- Chain Rule Challenge (Boss Type-B) -->
      <ChainRulePanel />

      <!-- Modal -->
      <Modal v-if="uiStore.modalVisible" />

      <!-- U-1: paused overlay -->
      <div
        v-if="paused"
        class="pause-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Game paused"
      >
        <div class="pause-box">
          <h3 class="pause-title">‖ Paused</h3>
          <p class="pause-hint">Press <kbd>Space</kbd> or <kbd>Esc</kbd> to resume</p>
          <button class="btn" @click="togglePause">Resume</button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.game-shell {
  position: fixed;
  inset: 0;
  background: #0b0a12;
}

.game-view {
  position: absolute;
  width: 1280px;
  height: 720px;
  transform-origin: top left;
  overflow: hidden;
}

.game-canvas {
  box-sizing: content-box;
  display: block;
  width: 1280px;
  height: 720px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.game-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.game-overlay > * {
  pointer-events: auto;
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* K-2 / K-3: boot states. Sit above the game-view so users see something
   while WASM initialises, and a retry affordance if it fails. */
.boot-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(11, 10, 18, 0.85);
  color: #e8dcc8;
  font-family: var(--font-mono);
  z-index: var(--z-modal);
}
.boot-state.error { color: var(--hp-red); }
.boot-title { font-size: 16px; letter-spacing: 2px; color: var(--gold); }
.boot-msg   { font-size: 12px; text-align: center; max-width: 480px; padding: 0 16px; }
.boot-spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--gold-dim);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: boot-spin 0.9s linear infinite;
}
@keyframes boot-spin { to { transform: rotate(360deg); } }

/* R-5: Portrait orientation overlay — only appears on narrow + tall
   viewports that can't show the 1280×720 layout legibly. */
.rotate-hint {
  display: none;
  position: absolute;
  inset: 0;
  z-index: var(--z-modal);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #0b0a12;
  color: var(--gold);
  font-family: var(--font-mono);
  text-align: center;
  padding: 24px;
}
.rotate-icon { font-size: 48px; animation: boot-spin 2s linear infinite; }
@media (orientation: portrait) and (max-width: 640px) {
  .rotate-hint { display: flex; }
}

/* U-1: pause overlay */
.pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-overlay);
  font-family: var(--font-mono);
}
.pause-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 48px;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  box-shadow: var(--panel-shadow);
}
.pause-title {
  font-size: 22px;
  color: var(--gold-bright);
  letter-spacing: 6px;
}
.pause-hint { font-size: 12px; color: var(--axis); letter-spacing: 1px; }
.pause-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 2px;
  border: 1px solid var(--gold-dim);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--gold);
}

</style>
