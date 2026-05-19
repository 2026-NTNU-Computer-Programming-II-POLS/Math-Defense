<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'
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

// Live remaining seconds for an active buff. BuffSystem only emits
// ACTIVE_BUFFS_CHANGED on add/expire, so buff.remainingTime is a snapshot —
// interpolate from activeBuffsSnapshotTime to drain the displayed countdown
// in step with timeTotal (~2 Hz via useGameLoop's RAF mirror).
function liveBuffSeconds(buff: { remainingTime: number }): number {
  return Math.ceil(Math.max(0, buff.remainingTime - (g.timeTotal - g.activeBuffsSnapshotTime)))
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

    <!-- Active buffs -->
    <div v-if="g.activeBuffs.length > 0" class="active-buffs">
      <div
        v-for="buff in g.activeBuffs"
        :key="buff.id"
        class="buff-icon"
        :title="`${buff.name} — ${liveBuffSeconds(buff)}s`"
      >
        <span class="buff-letter">{{ buff.name[0] }}</span>
        <span class="buff-timer">{{ liveBuffSeconds(buff) }}</span>
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
.hud {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  background: var(--bar-bg);
  border-bottom: 2px solid var(--gold);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 24px;
  font-family: var(--font-mono);
  z-index: var(--z-chrome);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.hud::-webkit-scrollbar { display: none; }

.hud-row2 {
  position: absolute;
  top: var(--hud-height, 48px); left: 0; right: 0;
  height: 44px;
  background: var(--bar-bg);
  border-bottom: 1px solid rgba(255, 215, 0, 0.3);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  font-family: var(--font-mono);
  z-index: var(--z-chrome);
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.hud-label {
  font-size: var(--text-xs);
  color: #ffffff;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hud-value {
  font-size: var(--text-lg);
  color: var(--gold);
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.phase    { color: var(--gold); font-size: var(--text-xs); }
.gold     { color: var(--gold-bright); }
.hp-low   { color: var(--hp-red); font-weight: 900; }
.hp-warn-icon { margin: 0 2px; }
.score    { color: var(--gold); }
.score-item { margin-left: auto; }

.star-icons { display: flex; gap: 1px; }
.star-filled { color: var(--gold-bright); font-size: var(--text-sm); }

.kill-value { color: var(--hp-red); font-size: var(--text-xs); }

.ia-indicator { font-size: var(--text-xs); padding: 2px 6px; border-radius: 3px; }
.ia-correct { background: rgba(96, 240, 144, 0.15); color: #60f090; }
.ia-wrong { background: rgba(255, 96, 48, 0.15); color: #ff6030; }

/* Wave progress */
.wave-progress { gap: 8px; }
.enemies-val { font-size: var(--text-xs); color: var(--hp-red); }
.wave-bar {
  display: inline-block;
  width: 80px;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--gold-dim);
  border-radius: 3px;
  overflow: hidden;
}
.wave-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--gold-bright));
  transition: width 180ms ease-out;
}

/* Monty Hall progress */
.mh-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mh-bar {
  display: inline-block;
  width: 60px;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid #a855f7;
  border-radius: 3px;
  overflow: hidden;
}
.mh-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #a855f7, #c084fc);
  transition: width 300ms ease-out;
}

/* Active buffs */
.active-buffs {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.buff-icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: rgba(212, 168, 64, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
}
.buff-letter { font-size: var(--text-xs); color: var(--gold); font-weight: bold; }
.buff-timer { font-size: var(--text-2xs); color: var(--axis); }

/* Prep timer */
.prep-timer {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Phase pulse */
.phase-pulse { animation: phase-pulse 520ms ease-out; }
@keyframes phase-pulse {
  0%   { transform: scale(1);    color: var(--gold-bright); text-shadow: 0 0 8px var(--gold); }
  40%  { transform: scale(1.18); color: var(--gold); text-shadow: 0 0 12px var(--gold); }
  100% { transform: scale(1);    color: #ffffff; text-shadow: none; }
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
  0%   { transform: scale(1);    color: var(--gold-bright); }
  40%  { transform: scale(1.18); color: var(--gold-bright); text-shadow: 0 0 8px var(--gold-bright); }
  100% { transform: scale(1);    color: inherit; text-shadow: none; }
}
@keyframes hud-value-pop-down {
  0%   { transform: scale(1);    color: var(--alert-red); }
  40%  { transform: scale(1.18); color: var(--alert-red); text-shadow: 0 0 8px var(--alert-red); }
  100% { transform: scale(1);    color: inherit; text-shadow: none; }
}
@keyframes hud-value-pop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.18); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .value-pop, .value-pop.pop-up, .value-pop.pop-down { animation: none; }
  .value-pop.pop-up   { color: var(--gold-bright); transition: color 280ms ease-out; }
  .value-pop.pop-down { color: var(--alert-red);   transition: color 280ms ease-out; }
}
</style>
