<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useGameLoop } from '@/composables/useGameLoop'
import { useKeyboardPlacement } from '@/composables/useKeyboardPlacement'
import { GamePhase, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/data/constants'
import { formatScore } from '@/utils/formatters'
import { parseLevelJson, parseTerritoryContext } from '@/utils/parseHistoryState'
import { iaAccuracyToLabelOpacity } from '@/math/curve-renderer'

import HUD from '@/components/game/HUD.vue'
import TowerBar from '@/components/game/TowerBar.vue'
import BuildPanel from '@/components/game/BuildPanel.vue'
import BuildHint from '@/components/game/BuildHint.vue'
import BuffCardPanel from '@/components/game/BuffCardPanel.vue'
import ShopPanel from '@/components/game/ShopPanel.vue'
import GameSpeedPanel from '@/components/game/GameSpeedPanel.vue'
import MontyHallPanel from '@/components/game/MontyHallPanel.vue'
import ScoreResultView from '@/views/ScoreResultView.vue'
import ChainRulePanel from '@/components/game/ChainRulePanel.vue'
import StartWaveButton from '@/components/game/StartWaveButton.vue'
import Modal from '@/components/common/Modal.vue'
import AchievementToast from '@/components/game/AchievementToast.vue'
import PrincipleOverlay from '@/components/game/PrincipleOverlay.vue'

const router = useRouter()
const gameStore = useGameStore()
const uiStore = useUiStore()
const authStore = useAuthStore()

// Concrete-fading on Star-1 path rendering (spec §17): the curve renderer
// reads gameStore.pathLabelOpacity at draw time. Star ≥ 2 always renders
// without labels — that matches pre-§17 behaviour. New players see full
// labels because authStore defaults ia_recent_accuracy to 0.
watch(
  () => [gameStore.starRating, authStore.user?.ia_recent_accuracy ?? 0] as const,
  ([star, acc]) => {
    gameStore.pathLabelOpacity = star === 1 ? iaAccuracyToLabelOpacity(acc) : 0
  },
  { immediate: true },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Read generated level + IA result forwarded via history state from InitialAnswerView.
// parseLevelJson enforces a size cap and a shape check (F-BUG-14 / M13).
const _generatedLevel = parseLevelJson(history.state?.level)
const _rawIa = history.state?.iaResult as string | undefined
const _iaResult = (_rawIa === 'correct' || _rawIa === 'wrong' || _rawIa === 'paid' || _rawIa === 'ignored')
  ? _rawIa
  : null
// parseTerritoryContext enforces a size cap and validates the expected shape.
const _territoryContext = parseTerritoryContext(history.state?.territoryContext)

// Replay/Spectate determinism (Backlog §24): the seed travels via
// LevelSelectView → InitialAnswerView → here. Falling back to Date.now() is
// only for the rare case where state is lost on a hard reload — that run
// won't be replayable, but the game still boots.
const _seed = (typeof history.state?.seed === 'number') ? history.state.seed : Date.now()

const {
  game, ready, loadError, retry, newlyUnlockedAchievements, lastCompletedSessionId,
  currentPrincipleId, clearPrinciple, restoreFromCheckpoint, isPracticeMode, abandonRun,
} = useGameLoop(canvasRef, {
  generatedLevel: _generatedLevel,
  iaResult: _iaResult,
  seed: _seed,
})

// §19 keyboard placement (WCAG 2.2 SC 2.1.1). Composable owns its own
// listener lifecycle; gating by BUILD phase happens inside the handler so
// a single registration covers the whole view.
useKeyboardPlacement(game)

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

const activePhases: GamePhase[] = [GamePhase.WAVE, GamePhase.BUILD, GamePhase.BUFF_SELECT, GamePhase.CHAIN_RULE]
const bypassLeaveConfirm = ref(false)

async function returnToLevelSelect(): Promise<void> {
  if (activePhases.includes(gameStore.phase)) {
    const ok = await uiStore.showConfirm(
      '放棄本局',
      '返回關卡選擇？本局不會被記錄，已取得的分數與進度都會放棄。',
      { confirmLabel: '返回' },
    )
    if (!ok) return
  }

  paused.value = false

  await abandonRun()
  bypassLeaveConfirm.value = true
  router.push({ name: 'level-select' }).catch((err) => {
    bypassLeaveConfirm.value = false
    console.warn('[GameView] Level-select navigation failed:', err)
  })
}

// Warn before navigating away mid-game (progress would be lost).
// beforeEnter on the game route already blocks entry without level data,
// so _generatedLevel is always non-null here.
onBeforeRouteLeave(async () => {
  if (bypassLeaveConfirm.value) return true
  if (activePhases.includes(gameStore.phase)) {
    return await uiStore.showConfirm(
      'Leave game',
      'Leave the game? Your current progress will be lost.',
      { confirmLabel: 'Leave' },
    )
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

// §12: at Star-5 with a captured checkpoint, defer to the inline retry
// dialog instead of the standard Game Over modal, so the player can
// resume from the last cleared wave.
const checkpointDialogVisible = ref(false)
watch(() => gameStore.phase, (phase) => {
  if (phase !== GamePhase.GAME_OVER) return
  if (gameStore.starRating === 5 && gameStore.lastCheckpoint) {
    checkpointDialogVisible.value = true
    return
  }
  uiStore.showModal(
    'Game Over',
    `Survived ${gameStore.wave} waves · Score: ${formatScore(gameStore.score)}`,
    navigateAfterLoss,
  )
})

function onRetryCheckpoint(): void {
  const cp = gameStore.lastCheckpoint
  if (!cp) return
  checkpointDialogVisible.value = false
  restoreFromCheckpoint(cp)
}

function onAbandonCheckpoint(): void {
  checkpointDialogVisible.value = false
  navigateAfterLoss()
}

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
}, { flush: 'sync' })

// Responsive scaling (audit C-5). The engine/canvas are authored against a
// fixed CANVAS_WIDTH×CANVAS_HEIGHT world, so rather than redoing layout math
// everywhere, we uniformly scale the whole view via CSS transform. Internal
// coordinates, pointer mapping (browsers account for CSS transforms), and DPR
// handling in `Renderer` all stay untouched.
const shellRef = ref<HTMLDivElement | null>(null)

function calcScale(W: number, H: number) {
  const pad = 2
  const s = Math.min(1, (W - pad * 2) / CANVAS_WIDTH, (H - pad * 2) / CANVAS_HEIGHT)
  return { s, ox: Math.floor((W - CANVAS_WIDTH * s) / 2), oy: Math.floor((H - CANVAS_HEIGHT * s) / 2) }
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
  <div
    ref="shellRef"
    class="game-shell"
    :data-star="gameStore.starRating"
    :style="{ '--canvas-w': `${CANVAS_WIDTH}px`, '--canvas-h': `${CANVAS_HEIGHT}px` }"
  >
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
      <PrincipleOverlay :principle-id="currentPrincipleId" @dismiss="clearPrinciple" />
      <HUD />
      <button
        v-if="activePhases.includes(gameStore.phase)"
        type="button"
        class="return-level-btn"
        aria-label="中途退出，本局不會被記錄"
        title="中途退出，本局不會被記錄"
        @click="returnToLevelSelect"
      >
        <span aria-hidden="true">←</span>
        中途退出
      </button>
      <!-- Backlog §20 — practice-mode badge persists for the entire WAVE/BUILD
           session so the player never forgets the run is leaderboard-ineligible. -->
      <div
        v-if="isPracticeMode"
        class="practice-badge"
        role="status"
        aria-live="polite"
      >Practice mode — leaderboard ineligible</div>
      <BuildHint />
      <div v-if="gameStore.isBuilding || gameStore.isWave" class="left-utility-stack">
        <ShopPanel v-if="gameStore.isBuilding" />
        <GameSpeedPanel />
      </div>

      <!-- Build Phase -->
      <template v-if="gameStore.isBuilding">
        <TowerBar />
        <BuildPanel v-if="uiStore.buildPanelVisible" />
        <StartWaveButton />
      </template>

      <!-- Buff Select (V1 compat) -->
      <BuffCardPanel v-if="gameStore.isBuff" />

      <!-- Monty Hall Event -->
      <MontyHallPanel v-if="gameStore.isMontyHall" />

      <!-- Score Result (Victory) -->
      <ScoreResultView
        v-if="gameStore.phase === GamePhase.LEVEL_END"
        :session-id="lastCompletedSessionId"
        :practice-mode="isPracticeMode"
        @close="navigateAfterGame"
      />

      <!-- Chain Rule Challenge (Boss Type-B) -->
      <ChainRulePanel />

      <!-- §12: Star-5 checkpoint retry dialog -->
      <div
        v-if="checkpointDialogVisible && gameStore.lastCheckpoint"
        class="checkpoint-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-title"
      >
        <div class="checkpoint-box">
          <h3 id="checkpoint-title" class="checkpoint-title">Game Over</h3>
          <p class="checkpoint-stat">
            Survived {{ gameStore.wave }} waves · Score: {{ formatScore(gameStore.score) }}
          </p>
          <p class="checkpoint-hint">
            Star-5 — retry from your last cleared wave?<br>
            <span class="checkpoint-practice">Checkpoint runs are flagged as practice (not eligible for class leaderboards).</span>
          </p>
          <div class="checkpoint-actions">
            <button class="btn-checkpoint primary" @click="onRetryCheckpoint">
              Retry from Wave {{ gameStore.lastCheckpoint.waveIndex }}
            </button>
            <button class="btn-checkpoint" @click="onAbandonCheckpoint">
              Give Up
            </button>
          </div>
        </div>
      </div>

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
  background: var(--bg-base);
}

.game-view {
  position: absolute;
  width: var(--canvas-w);
  height: var(--canvas-h);
  transform-origin: top left;
  overflow: hidden;
}

.game-canvas {
  box-sizing: content-box;
  display: block;
  width: var(--canvas-w);
  height: var(--canvas-h);
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

.left-utility-stack {
  position: absolute;
  left: 8px;
  top: 100px;
  z-index: var(--z-chrome);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.return-level-btn {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 56px);
  right: 12px;
  z-index: var(--z-action);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--gold-border);
  border-radius: 4px;
  background: rgba(44, 62, 80, 0.82);
  color: var(--gold-bright);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.return-level-btn:hover {
  background: rgba(44, 62, 80, 0.96);
  border-color: var(--gold);
}

.return-level-btn:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
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
  background: var(--overlay-bg);
  color: #ffffff;
  font-family: var(--font-mono);
  z-index: var(--z-modal);
}
.boot-state.error { color: var(--hp-red); }
.boot-title { font-size: 16px; letter-spacing: 2px; color: var(--gold); text-shadow: var(--gold-shadow); }
.boot-msg   { font-size: 12px; text-align: center; max-width: 480px; padding: 0 16px; }
.boot-spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--gold-dim);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: boot-spin 0.9s linear infinite;
}
@keyframes boot-spin { to { transform: rotate(360deg); } }

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
.pause-hint { font-size: 12px; color: var(--axis); text-shadow: var(--gold-shadow); letter-spacing: 1px; }
.pause-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 2px;
  border: 1px solid var(--gold-dim);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
}

/* §12: Star-5 checkpoint retry dialog */
.checkpoint-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  font-family: var(--font-mono);
}
.checkpoint-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 40px;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  box-shadow: var(--panel-shadow);
  max-width: 460px;
  text-align: center;
}
.checkpoint-title {
  margin: 0;
  font-size: 20px;
  color: var(--gold-bright);
  letter-spacing: 4px;
}
.checkpoint-stat {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}
.checkpoint-hint {
  margin: 0;
  font-size: 12px;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  line-height: 1.5;
}
.checkpoint-practice {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--gold-dim);
  font-style: italic;
}
.checkpoint-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.btn-checkpoint {
  padding: 8px 20px;
  border: 1px solid var(--gold-dim);
  border-radius: 4px;
  background: rgba(212, 160, 23, 0.1);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms;
}
.btn-checkpoint:hover {
  background: rgba(212, 160, 23, 0.25);
}
.btn-checkpoint.primary {
  border-color: var(--gold);
  color: var(--text-on-accent);
  background: rgba(212, 160, 23, 0.3);
  font-weight: bold;
}
.btn-checkpoint.primary:hover {
  background: rgba(212, 160, 23, 0.5);
}

/* Backlog §20 — practice-mode badge */
.practice-badge {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 98px);
  right: 12px;
  padding: 4px 10px;
  background: rgba(144, 104, 200, 0.18);
  border: 1px solid #9068c8;
  border-radius: 4px;
  color: #c8a4ff;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.5px;
  z-index: var(--z-overlay);
  pointer-events: none;
}

</style>
