<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useGameLoop } from '@/composables/useGameLoop'
import { useKeyboardPlacement } from '@/composables/useKeyboardPlacement'
import { useFirstEncounterCards } from '@/composables/useFirstEncounterCards'
import { GamePhase, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/data/constants'
import { formatScore } from '@/utils/formatters'
import { parseLevelJson, parseTerritoryContext } from '@/utils/parseHistoryState'
import { iaAccuracyToLabelOpacity } from '@/math/curve-renderer'

import HUD from '@/components/game/HUD.vue'
import TowerBar from '@/components/game/TowerBar.vue'
import BuildPanel from '@/components/game/BuildPanel.vue'
import BuildHint from '@/components/game/BuildHint.vue'
import WaveForecast from '@/components/game/WaveForecast.vue'
import WaveBanner from '@/components/game/WaveBanner.vue'
import PhaseFader from '@/components/game/PhaseFader.vue'
import FirstEncounterCard from '@/components/game/FirstEncounterCard.vue'
import BuffCardPanel from '@/components/game/BuffCardPanel.vue'
import ShopPanel from '@/components/game/ShopPanel.vue'
import GameSpeedPanel from '@/components/game/GameSpeedPanel.vue'
import MontyHallPanel from '@/components/game/MontyHallPanel.vue'
import ScoreResultView from '@/views/ScoreResultView.vue'
import ChainRulePanel from '@/components/game/ChainRulePanel.vue'
import StartWaveButton from '@/components/game/StartWaveButton.vue'
import AchievementToast from '@/components/game/AchievementToast.vue'
import PrincipleOverlay from '@/components/game/PrincipleOverlay.vue'
import ManualModal from '@/components/common/ManualModal.vue'

const router = useRouter()
const gameStore = useGameStore()
const uiStore = useUiStore()
const authStore = useAuthStore()

// Active-buff tokens in the left rail. `remainingTime` is the engine's live
// value (BuffSystem ticks it during WAVE; gameStore mirrors the array every Nth
// frame), so just round it for display. Initials use the buff's word-initials
// (e.g. "Sharpen Blades" → SB).
function liveBuffSeconds(buff: { remainingTime: number }): number {
  return Math.ceil(buff.remainingTime)
}
function buffInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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

// V3 Phase 6 §6.2 — first-encounter telegraph cards. The composable owns the
// queue and soft-pauses via Game.stop/start (no new GamePhase); this view
// just renders the active card and routes its dismiss back.
const { activeCard: firstEncounterCard, dismiss: dismissFirstEncounter } = useFirstEncounterCards(game)

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
      'Abandon Run',
      'Return to level select? This run will not be recorded, and your current score and progress will be lost.',
      { confirmLabel: 'Return', cancelLabel: 'Cancel' },
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
  // When api.ts has exhausted its refresh-and-retry budget on a 401, the
  // auth store drives navigation to /auth itself via a sticky
  // "Session expired" modal. Popping a second "Leave game?" confirm on top
  // would be both misleading (the player didn't ask to leave) and stack
  // two modals on screen — let the auth flow through silently.
  if (authStore.sessionExpired) return true
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
    // `wave` is incremented at BUILD→WAVE transition (Game.startWave), so it
    // is already 1-indexed during WAVE — do NOT add 1 here.
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

const manualOpen = ref(false)

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
  // While a first-encounter card is open the game is already soft-paused by
  // useFirstEncounterCards (a separate Game.stop/start owner). Letting Space /
  // Esc also drive the manual `paused` flag here would desync the two: the
  // game could resume behind a stale pause overlay, or the card's pause could
  // be lifted out from under it. Defer to the card while it is showing.
  if (firstEncounterCard.value) return
  // While the manual is open it owns Escape (close) and Space should not pause.
  if (manualOpen.value) return
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

// MAX_SCALE caps upscaling so the pixel-art canvas stays legible without
// becoming excessively blocky on very large / 4K displays. Screens smaller
// than the world still scale down freely.
const MAX_SCALE = 3.0

function calcScale(W: number, H: number) {
  const pad = 2
  const s = Math.min(MAX_SCALE, (W - pad * 2) / CANVAS_WIDTH, (H - pad * 2) / CANVAS_HEIGHT)
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
    ro = new ResizeObserver(() => recomputeScale())
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
      <!-- Top-right HUD actions: Manual (?) + Exit, beside the IA pill. -->
      <div class="hud-actions">
        <button
          type="button"
          class="manual-btn"
          aria-label="Open field reference manual"
          title="Field reference (towers, enemies, spells)"
          @click="manualOpen = true"
        >?</button>
        <button
          v-if="activePhases.includes(gameStore.phase)"
          type="button"
          class="return-level-btn"
          aria-label="Exit run early. This run will not be recorded."
          title="Exit run early. This run will not be recorded."
          @click="returnToLevelSelect"
        >
          <span aria-hidden="true">&#8856;</span>
          Exit
        </button>
      </div>
      <!-- Backlog §20 — practice-mode badge persists for the entire
           WAVE/BUILD session so the player never forgets the run is
           leaderboard-ineligible. -->
      <div v-if="isPracticeMode" class="corner-controls">
        <div
          class="practice-badge"
          role="status"
          aria-live="polite"
        >Practice mode — leaderboard ineligible</div>
      </div>
      <ManualModal :open="manualOpen" mode="reference" @close="manualOpen = false" />
      <BuildHint />
      <WaveForecast />
      <WaveBanner />
      <PhaseFader />
      <div v-if="gameStore.isBuilding || gameStore.isWave" class="left-utility-stack">
        <div class="lb-label">Tools</div>
        <!-- Shop is build-only (purchases need BUILD). The speed toggle only
             drives the loop during WAVE, so it is wave-only too. -->
        <ShopPanel v-if="gameStore.isBuilding" />
        <GameSpeedPanel v-if="gameStore.isWave" />

        <!-- ACTIVE BUFFS label always shows; the token cards appear as buffs
             are acquired. -->
        <div class="lb-label">Active Buffs</div>
        <div
          v-for="buff in gameStore.activeBuffs"
          :key="buff.id"
          class="lb-buff"
          :title="`${buff.name} — ${liveBuffSeconds(buff)}s left`"
        >
          <span class="b-ico" aria-hidden="true">{{ buffInitials(buff.name) }}</span>
          <span class="b-info">
            <span class="nm">{{ buff.name }}</span>
            <span class="ct">{{ liveBuffSeconds(buff) }} s</span>
          </span>
        </div>
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

      <!-- V3 Phase 6 §6.2: first-encounter card (soft-pauses via the composable) -->
      <FirstEncounterCard :type="firstEncounterCard" @dismiss="dismissFirstEncounter" />

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
    </div> <!-- /.game-overlay -->
    </div> <!-- /.game-view -->
  </div> <!-- /.game-shell -->
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

/* Bottom-left practice-mode badge slot — anchored above the TowerBar at
   bottom-LEFT so it clears the right-side FunctionPanel / TowerInfoPanel.
   The container is click-through (the higher-specificity selector overrides
   `.game-overlay > *` above); the badge itself is also pointer-events:none,
   so the slot never swallows canvas input. */
.game-overlay > .corner-controls {
  position: absolute;
  left: 16px;
  bottom: calc(var(--tower-bar-height, 64px) + 12px);
  z-index: var(--z-action);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
/* Top-right HUD actions row — Manual (?) + Exit, sitting in the top HUD band
   beside the IA pill (the HUD reserves .gh-right margin-right for this slot).
   Click-through container; only the buttons catch pointer events. */
.game-overlay > .hud-actions {
  position: absolute;
  top: 0;
  right: 16px;
  height: var(--hud-height, 56px);
  z-index: var(--z-action);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.hud-actions .manual-btn,
.hud-actions .return-level-btn {
  pointer-events: auto;
}

.left-utility-stack {
  position: absolute;
  left: 0;
  /* Flush against the left edge and the bottom of the HUD sub-bar (MH/spells
     row) so it never covers it; stretch down to just above the tower panel.
     The +52 matches the new .hud-row2 height in HUD.vue. */
  top: calc(var(--hud-height, 56px) + 52px);
  bottom: calc(var(--tower-bar-height, 64px) + 8px);
  z-index: var(--z-chrome);
  width: 200px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  /* Visible (not auto) so the Shop dropdown can extend past the sidebar at its
     full width instead of being clipped to the sidebar's narrow column. */
  overflow: visible;
  /* Light-blue sidebar surface behind the tools + active buffs. */
  padding: 12px 10px;
  background: var(--rail-surface);
  border: 1px solid var(--line);
  border-radius: 0;
  box-shadow: var(--shadow-sm);
}

/* Section label (mockup): centered mono caps, muted. Sized + tracked so the
   longer "ACTIVE BUFFS" label fits the narrow rail on a single line. */
.left-utility-stack .lb-label {
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 2px;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--charcoal-soft);
  margin-bottom: 2px;
}

/* Active-buff token card (mockup): circular initials avatar + name + seconds. */
.left-utility-stack .lb-buff {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: rgba(173, 187, 166, 0.20);
  border: 1px solid rgba(126, 144, 119, 0.40);
  border-radius: 10px;
}
.left-utility-stack .b-ico {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--sage-deep);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: 800;
  flex-shrink: 0;
}
.left-utility-stack .b-info {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
  flex: 1 1 auto;
}
.left-utility-stack .b-info .nm {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--charcoal);
  /* Wrap to as many lines as needed so the full buff name is always shown. */
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.2;
}
.left-utility-stack .b-info .ct {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
}

/* Exit Run — clay-tinted labelled pill (mockup .gh-icon-btn.exit) */
.return-level-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(185, 134, 116, 0.45);
  border-radius: 10px;
  background: rgba(185, 134, 116, 0.18);
  color: var(--clay-deep);
  font-family: var(--font-main);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.return-level-btn:hover {
  background: var(--clay);
  color: #fff;
  border-color: var(--clay-deep);
}

.return-level-btn:focus-visible {
  outline: 2px solid var(--clay-deep);
  outline-offset: 2px;
}

/* Manual — square "?" icon button (mockup .gh-icon-btn) */
.manual-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgba(245, 250, 254, 0.85);
  color: var(--charcoal-soft);
  font-family: var(--font-main);
  font-size: var(--text-md);
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.manual-btn:hover {
  background: #fff;
  color: var(--terracotta-deep);
  border-color: var(--terracotta);
}

.manual-btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
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
  background: rgba(220, 229, 237, 0.92);
  color: var(--charcoal);
  font-family: var(--font-mono);
  z-index: var(--z-modal);
}
.boot-state.error { color: var(--clay-deep); }
.boot-title { font-size: var(--text-base); letter-spacing: 2px; color: var(--terracotta-deep); text-shadow: none; }
.boot-msg   { font-size: var(--text-xs); text-align: center; max-width: 480px; padding: 0 16px; color: var(--charcoal-soft); }
.boot-spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--line-strong);
  border-top-color: var(--terracotta);
  border-radius: 50%;
  animation: boot-spin 0.9s linear infinite;
}
@keyframes boot-spin { to { transform: rotate(360deg); } }

/* U-1: pause overlay */
.pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(79, 74, 72, 0.55);
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
  background: rgba(220, 229, 237, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
}
.pause-title {
  font-size: var(--text-xl);
  color: var(--charcoal);
  letter-spacing: 6px;
}
.pause-hint { font-size: var(--text-xs); color: var(--charcoal-soft); letter-spacing: 1px; }
.pause-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 2px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--charcoal);
}

/* §12: Star-5 checkpoint retry dialog */
.checkpoint-overlay {
  position: absolute;
  inset: 0;
  background: rgba(79, 74, 72, 0.6);
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
  background: rgba(220, 229, 237, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  max-width: 460px;
  text-align: center;
}
.checkpoint-title {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--charcoal);
  letter-spacing: 4px;
}
.checkpoint-stat {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--charcoal);
}
.checkpoint-hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  line-height: 1.5;
}
.checkpoint-practice {
  display: inline-block;
  margin-top: 6px;
  font-size: var(--text-xs);
  color: var(--plum-deep);
  font-style: italic;
}
.checkpoint-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.btn-checkpoint {
  padding: 8px 20px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgba(245, 250, 254, 0.78);
  color: var(--charcoal);
  font-family: var(--font-main);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}
.btn-checkpoint:hover {
  background: #fff;
  border-color: var(--terracotta);
}
.btn-checkpoint.primary {
  border-color: var(--gold-deep);
  color: #fff;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}
.btn-checkpoint.primary:hover {
  background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold) 100%);
}

/* Backlog §20 — practice-mode badge */
.practice-badge {
  position: absolute;
  top: calc(var(--hud-height, 56px) + 98px);
  right: 12px;
  padding: 4px 10px;
  background: rgba(162, 141, 160, 0.2);
  border: 1px solid var(--plum);
  border-radius: 999px;
  color: var(--plum-deep);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.5px;
  pointer-events: none;
}

</style>
