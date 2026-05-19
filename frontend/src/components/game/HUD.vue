<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase, Events } from '@/data/constants'
import { formatScore } from '@/utils/formatters'
import { MONTY_HALL_THRESHOLDS_BY_STAR } from '@/data/monty-hall-defs'
import { useValuePop } from '@/composables/useValuePop'
import FunctionPanel from './FunctionPanel.vue'
import SpellBar from './SpellBar.vue'

const g = useGameStore()

// Visual Redesign Phase 4 — HUD value-pop bindings. Each readout flashes
// briefly when its source ref changes; direction tints the flash up (gold)
// or down (red). Reduced-motion is honoured at the CSS layer by stripping
// the scale keyframe while preserving the color flash.
const goldPop  = useValuePop(toRef(g, 'gold'))
const hpPop    = useValuePop(toRef(g, 'hp'))
const scorePop = useValuePop(toRef(g, 'score'))
const wavePop  = useValuePop(toRef(g, 'wave'))

const phaseLabel = computed(() => {
  switch (g.phase) {
    case GamePhase.BUILD:       return 'Build Phase'
    case GamePhase.WAVE:        return `Wave ${g.wave}`
    case GamePhase.BUFF_SELECT: return 'Buff Selection'
    case GamePhase.MONTY_HALL:  return 'Monty Hall!'
    case GamePhase.LEVEL_END:   return 'Victory!'
    case GamePhase.GAME_OVER:   return 'Game Over'
    default:                    return ''
  }
})

const goldStr = computed(() => String(g.gold).padStart(4, '0'))
const hpStr   = computed(() => `${g.hp} / ${g.healthOrigin}`)

const iaLabel = computed(() => {
  if (g.initialAnswer === 1) return 'IA: Correct'
  return 'IA: Wrong'
})
const iaClass = computed(() => g.initialAnswer === 1 ? 'ia-correct' : 'ia-wrong')

// Wave progress
const wavePeak = ref(0)
watch(() => g.wave, () => { wavePeak.value = 0 })
watch(() => g.enemiesAlive, (n) => {
  if (n > wavePeak.value) wavePeak.value = n
})
const waveFillPct = computed(() => {
  if (wavePeak.value === 0) return 0
  return Math.max(0, Math.min(100, ((wavePeak.value - g.enemiesAlive) / wavePeak.value) * 100))
})

// Monty Hall progress
const montyHallPct = computed(() => {
  const thresholds = MONTY_HALL_THRESHOLDS_BY_STAR[g.starRating] ?? []
  if (thresholds.length === 0) return 0
  let nextThreshold = 0
  let prevThreshold = 0
  for (const t of thresholds) {
    if (g.montyHallProgress < t.killValue) {
      nextThreshold = t.killValue
      break
    }
    prevThreshold = t.killValue
  }
  if (nextThreshold === 0) return 100
  const range = nextThreshold - prevThreshold
  if (range <= 0) return 0
  return Math.min(100, ((g.montyHallProgress - prevThreshold) / range) * 100)
})

// Phase pulse animation
const phasePulseKey = ref(0)
watch(() => g.phase, () => { phasePulseKey.value++ })

// Prep phase timer
const prepTime = computed(() => {
  if (g.phase !== GamePhase.BUILD || g.wave === 0) return null
  return Math.floor(g.timeTotal)
})

// Live buff countdown. BuffSystem only emits ACTIVE_BUFFS_CHANGED on
// add/expire, so buff.remainingTime is a snapshot — interpolate from
// activeBuffsSnapshotTime to drain the displayed values in step with
// timeTotal (~2 Hz via useGameLoop's RAF mirror).
function liveBuffRemaining(buff: { remainingTime: number }): number {
  return Math.max(0, buff.remainingTime - (g.timeTotal - g.activeBuffsSnapshotTime))
}
function liveBuffSeconds(buff: { remainingTime: number }): number {
  return Math.ceil(liveBuffRemaining(buff))
}

// SVG countdown ring geometry — r = 15.5 in a 36×36 viewBox. The fill
// circle drains via stroke-dashoffset as the remaining fraction shrinks,
// giving a clock-like readout around the buff token.
const RING_CIRCUMFERENCE = 2 * Math.PI * 15.5

function ringOffset(buff: { remainingTime: number; totalDuration: number }): number {
  const frac = buff.totalDuration > 0
    ? liveBuffRemaining(buff) / buff.totalDuration
    : 0
  return RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, frac)))
}

// ─── Buff expiry ghosts ───────────────────────────────────────────────
// When a timed buff's countdown hits zero its token would otherwise just
// vanish. Instead we keep a short-lived "ghost" that flashes a ✓ and fades
// out, so the player gets an unmistakable "the buff ended" signal. Driven
// by the BUFF_EXPIRED engine event — a store diff cannot tell a genuine
// timeout apart from the level-start buff cleanup.
interface BuffGhost { id: string; name: string; letter: string }
const EXPIRY_GHOST_MS = 1100
const expiringGhosts = ref<BuffGhost[]>([])
let ghostSeq = 0
let unsubBuffExpired: (() => void) | null = null

function spawnExpiryGhost(name: string): void {
  const id = `ghost_${ghostSeq++}`
  expiringGhosts.value = [...expiringGhosts.value, { id, name, letter: name[0] ?? '?' }]
  window.setTimeout(() => {
    expiringGhosts.value = expiringGhosts.value.filter((gh) => gh.id !== id)
  }, EXPIRY_GHOST_MS)
}

// HUD height publish
const hudRef = ref<HTMLDivElement | null>(null)
let hudRo: ResizeObserver | null = null

function publishHudHeight(h: number): void {
  const el = hudRef.value?.parentElement
  if (!el) return
  el.style.setProperty('--hud-height', `${Math.round(h)}px`)
}

onMounted(() => {
  // Subscribe to buff expiry so a token can flash a ✓ ghost as it ends.
  // HUD mounts after the engine is wired (SpellBar, a child, relies on the
  // same access), but guard anyway and warn in dev if the timing slips.
  const engine = g.getEngine()
  if (engine) {
    unsubBuffExpired = engine.eventBus.on(Events.BUFF_EXPIRED, ({ name }) => {
      spawnExpiryGhost(name)
    })
  } else if (import.meta.env.DEV) {
    console.warn('[HUD] engine not ready at mount — buff-expiry flash disabled')
  }

  const el = hudRef.value
  if (!el) return
  publishHudHeight(el.offsetHeight)
  hudRo = new ResizeObserver((entries, _observer) => {
    for (const entry of entries) publishHudHeight(entry.contentRect.height)
  })
  hudRo.observe(el)
})

onBeforeUnmount(() => {
  hudRo?.disconnect()
  hudRo = null
  unsubBuffExpired?.()
  unsubBuffExpired = null
})
</script>

<template>
  <div ref="hudRef" class="hud">
    <!-- Phase -->
    <div class="hud-item phase-label">
      <span class="hud-label">Phase</span>
      <span
        :key="phasePulseKey"
        class="hud-value phase phase-pulse"
        :class="{ 'value-pop': wavePop.popping.value, [`pop-${wavePop.direction.value}`]: wavePop.direction.value }"
      >{{ phaseLabel }}</span>
    </div>

    <!-- Star Rating -->
    <div class="hud-item">
      <span class="hud-label">Star</span>
      <span class="hud-value star-icons">
        <span v-for="i in g.starRating" :key="i" class="star-filled">&#9733;</span>
      </span>
    </div>

    <!-- Gold -->
    <div class="hud-item" role="group" :aria-label="`Gold: ${g.gold}`">
      <span class="hud-label">Gold</span>
      <span
        class="hud-value gold"
        :class="{ 'value-pop': goldPop.popping.value, [`pop-${goldPop.direction.value}`]: goldPop.direction.value }"
      >
        <span aria-hidden="true">&#x2B21;</span> {{ goldStr }}
      </span>
    </div>

    <!-- HP -->
    <div class="hud-item" role="group" :aria-label="`Hit points: ${g.hp} of ${g.healthOrigin}`">
      <span class="hud-label">HP</span>
      <span
        class="hud-value"
        :class="{ 'hp-low': g.hp <= 5, 'value-pop': hpPop.popping.value, [`pop-${hpPop.direction.value}`]: hpPop.direction.value }"
      >
        <span aria-hidden="true">&#9829;</span>
        <span v-if="g.hp <= 5" aria-hidden="true" class="hp-warn-icon">&#9888;</span>
        {{ hpStr }}
      </span>
    </div>

    <!-- Kill Value -->
    <div class="hud-item">
      <span class="hud-label">Kills</span>
      <span class="hud-value kill-value">{{ g.cumulativeKillValue }}</span>
    </div>

    <!-- IA Indicator -->
    <div class="hud-item">
      <span class="hud-value ia-indicator" :class="iaClass">{{ iaLabel }}</span>
    </div>

    <!-- Wave progress -->
    <div
      v-if="g.isWave"
      class="hud-item wave-progress"
      role="group"
      :aria-label="`Enemies remaining: ${g.enemiesAlive}`"
    >
      <span class="hud-label">Enemies</span>
      <span class="hud-value enemies-val">{{ g.enemiesAlive }}</span>
      <span class="wave-bar" aria-hidden="true">
        <span class="wave-bar-fill" :style="{ width: `${waveFillPct}%` }" />
      </span>
    </div>

    <!-- Score -->
    <div class="hud-item score-item">
      <span class="hud-label">Score</span>
      <span
        class="hud-value score"
        :class="{ 'value-pop': scorePop.popping.value, [`pop-${scorePop.direction.value}`]: scorePop.direction.value }"
      >{{ formatScore(g.score) }}</span>
    </div>
  </div>

  <!-- Second row: Monty Hall progress + Spell bar + Active buffs -->
  <div class="hud-row2">
    <!-- Monty Hall progress -->
    <div class="mh-progress" title="Progress toward next Monty Hall event">
      <span class="hud-label">MH</span>
      <span class="mh-bar">
        <span class="mh-bar-fill" :style="{ width: `${montyHallPct}%` }" />
      </span>
    </div>

    <!-- Spell bar -->
    <SpellBar />

    <!-- Active buffs — circular countdown tokens + expiry-flash ghosts -->
    <div
      v-if="g.activeBuffs.length > 0 || expiringGhosts.length > 0"
      class="active-buffs"
    >
      <div
        v-for="buff in g.activeBuffs"
        :key="buff.id"
        class="buff-icon"
        role="img"
        :aria-label="`${buff.name}: ${liveBuffSeconds(buff)} seconds remaining`"
        :title="`${buff.name} — ${liveBuffSeconds(buff)}s left`"
      >
        <svg class="buff-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="ring-track" cx="18" cy="18" r="15.5" />
          <circle
            class="ring-fill"
            cx="18"
            cy="18"
            r="15.5"
            :stroke-dasharray="RING_CIRCUMFERENCE"
            :style="{ strokeDashoffset: `${ringOffset(buff)}px` }"
          />
        </svg>
        <span class="buff-letter">{{ buff.name[0] }}</span>
        <span class="buff-timer">{{ liveBuffSeconds(buff) }}s</span>
      </div>
      <div
        v-for="ghost in expiringGhosts"
        :key="ghost.id"
        class="buff-icon buff-icon--expired"
        role="img"
        :aria-label="`${ghost.name} expired`"
        :title="`${ghost.name} expired`"
      >
        <svg class="buff-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="ring-track" cx="18" cy="18" r="15.5" />
        </svg>
        <span class="buff-letter">{{ ghost.letter }}</span>
        <span class="buff-timer expired-mark" aria-hidden="true">&#10003;</span>
      </div>
    </div>

    <!-- Prep timer -->
    <div v-if="prepTime !== null" class="prep-timer">
      <span class="hud-label">Prep</span>
      <span class="hud-value">{{ prepTime }}s</span>
    </div>
  </div>

  <FunctionPanel />
</template>

<style scoped>
/* Top HUD — slim Morandi chrome (mockup .gh-top, ~56px) */
.hud {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 56px;
  background: linear-gradient(180deg, rgba(220, 229, 237, 0.98), rgba(200, 210, 220, 0.94));
  border-bottom: 1px solid var(--line-strong);
  display: flex;
  align-items: center;
  padding: 0 18px;
  gap: 18px;
  font-family: var(--font-mono);
  z-index: var(--z-chrome);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.hud::-webkit-scrollbar { display: none; }

/* Sub-HUD strip (mockup .gh-subhud, ~68px) */
.hud-row2 {
  position: absolute;
  top: var(--hud-height, 56px); left: 0; right: 0;
  height: 68px;
  background: rgba(220, 229, 237, 0.78);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  padding: 0 18px;
  gap: 12px;
  font-family: var(--font-mono);
  z-index: var(--z-chrome);
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Phase rendered as a Morandi pill */
.phase-label {
  gap: 10px;
  padding: 6px 14px;
  background: rgba(168, 188, 203, 0.24);
  border: 1px solid rgba(168, 188, 203, 0.45);
  border-radius: 999px;
}

.hud-label {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.hud-value {
  font-size: var(--text-lg);
  color: var(--charcoal);
  font-weight: 700;
  text-shadow: none;
}

.phase    { color: var(--charcoal); font-size: var(--text-xs); letter-spacing: 1px; text-transform: uppercase; }
.gold     { color: var(--gold-deep); }
.hp-low   { color: var(--clay-deep); font-weight: 900; }
.hp-warn-icon { margin: 0 2px; color: var(--clay-deep); }
.score    { color: var(--teal-deep); }
.score-item { margin-left: auto; }

.star-icons { display: flex; gap: 1px; }
.star-filled { color: var(--terracotta); font-size: var(--text-sm); }

.kill-value { color: var(--charcoal); font-size: var(--text-xs); }

/* IA pill — sage (correct) / clay (wrong) */
.ia-indicator {
  font-size: var(--text-2xs);
  letter-spacing: 1.5px;
  padding: 5px 12px;
  border-radius: 999px;
}
.ia-correct { background: rgba(126, 144, 119, 0.18); color: var(--sage-deep); border: 1px solid rgba(126, 144, 119, 0.4); }
.ia-wrong   { background: rgba(185, 134, 116, 0.18); color: var(--clay-deep); border: 1px solid rgba(185, 134, 116, 0.4); }

/* Wave progress */
.wave-progress { gap: 8px; }
.enemies-val { font-size: var(--text-xs); color: var(--charcoal); }
.wave-bar {
  display: inline-block;
  width: 80px;
  height: 6px;
  background: rgba(79, 74, 72, 0.08);
  border: 1px solid var(--line);
  border-radius: 3px;
  overflow: hidden;
}
.wave-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--terracotta-deep), var(--terracotta));
  transition: width 180ms ease-out;
}

/* Monty Hall progress (plum) */
.mh-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mh-progress .hud-label { color: var(--plum-deep); }
.mh-bar {
  display: inline-block;
  width: 96px;
  height: 5px;
  background: rgba(79, 74, 72, 0.08);
  border: 1px solid rgba(162, 141, 160, 0.4);
  border-radius: 3px;
  overflow: hidden;
}
.mh-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--plum), var(--plum-deep));
  transition: width 300ms ease-out;
}

/* Active buffs — circular countdown tokens with sage chrome. The SVG ring
   drains as the buff's remaining fraction shrinks (a clock-like readout);
   the centre shows the buff initial and integer seconds remaining. */
.active-buffs {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.buff-icon {
  position: relative;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(126, 144, 119, 0.42);
  border-radius: 8px;
  background: rgba(173, 187, 166, 0.22);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  line-height: 1;
}
.buff-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Drain clockwise starting from 12 o'clock. */
  transform: rotate(-90deg);
}
.ring-track {
  fill: rgba(212, 168, 64, 0.08);
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 3;
}
.ring-fill {
  fill: none;
  stroke: var(--gold-bright);
  stroke-width: 3;
  stroke-linecap: round;
  /* The 2 Hz data ticks interpolate smoothly across the gap — mirrors the
     shop panel's draining-indicator transition. */
  transition: stroke-dashoffset 480ms linear;
}
.buff-letter {
  position: relative;
  font-size: var(--text-2xs);
  color: var(--gold);
  font-weight: bold;
}
.buff-timer {
  position: relative;
  font-size: var(--text-xs);
  color: var(--gold-bright);
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

/* Expiry ghost — a buff whose timer just hit zero. Flashes a green ✓ and
   fades out over EXPIRY_GHOST_MS so the player registers that it ended. */
.buff-icon--expired {
  animation: buff-expire-flash 1100ms ease-out forwards;
}
/* Bright green for green-on-dark legibility — matches .ia-correct's tone
   on the same HUD bar; the --hp-green token (#048634) is tuned for lighter
   panel backgrounds and reads too dark here. */
.buff-icon--expired .ring-track { stroke: #60f090; }
.buff-icon--expired .buff-letter { color: #60f090; }
.expired-mark {
  color: #60f090;
  font-size: var(--text-sm);
}
@keyframes buff-expire-flash {
  0%   { transform: scale(1);    opacity: 1; }
  18%  { transform: scale(1.22); opacity: 1; }
  45%  { transform: scale(1);    opacity: 1; }
  100% { transform: scale(0.92); opacity: 0; }
}
/* Reduced motion — drop the scale bounce + ring tween, keep the colour
   flash and an opacity fade so the expiry signal still reads. */
@media (prefers-reduced-motion: reduce) {
  .ring-fill { transition: none; }
  .buff-icon--expired { animation: buff-expire-fade 1100ms ease-out forwards; }
}
@keyframes buff-expire-fade {
  0%, 60% { opacity: 1; }
  100%    { opacity: 0; }
}

/* Prep timer */
.prep-timer {
  display: flex;
  align-items: center;
  gap: 6px;
}
.prep-timer .hud-value { color: var(--charcoal); font-size: var(--text-sm); }

/* Phase pulse — Morandi tint */
.phase-pulse { animation: phase-pulse 520ms ease-out; }
@keyframes phase-pulse {
  0%   { transform: scale(1);    color: var(--terracotta-deep); }
  40%  { transform: scale(1.18); color: var(--terracotta-deep); }
  100% { transform: scale(1);    color: var(--charcoal); }
}
@media (prefers-reduced-motion: reduce) {
  .phase-pulse { animation: none; }
}

/* Visual Redesign Phase 4 — HUD value pop.
   scale(1) → scale(1.18) → scale(1) over ANIM.HUD_VALUE_POP (0.28s)
   with a tinted color flash; direction class drives the tint hue.
   Reduced motion drops the scale half but keeps the colour flash so the
   change is still perceptible without bouncing layout. */
.value-pop {
  animation: hud-value-pop 280ms ease-out;
  display: inline-block;
  transform-origin: center;
}
.value-pop.pop-up   { animation-name: hud-value-pop-up; }
.value-pop.pop-down { animation-name: hud-value-pop-down; }
@keyframes hud-value-pop-up {
  0%   { transform: scale(1);    color: var(--gold-deep); }
  40%  { transform: scale(1.18); color: var(--gold-deep); text-shadow: 0 0 8px var(--gold-soft); }
  100% { transform: scale(1);    color: inherit; text-shadow: none; }
}
@keyframes hud-value-pop-down {
  0%   { transform: scale(1);    color: var(--clay-deep); }
  40%  { transform: scale(1.18); color: var(--clay-deep); text-shadow: 0 0 8px var(--clay); }
  100% { transform: scale(1);    color: inherit; text-shadow: none; }
}
@keyframes hud-value-pop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.18); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .value-pop, .value-pop.pop-up, .value-pop.pop-down { animation: none; }
  .value-pop.pop-up   { color: var(--gold-deep); transition: color 280ms ease-out; }
  .value-pop.pop-down { color: var(--clay-deep); transition: color 280ms ease-out; }
}
</style>
