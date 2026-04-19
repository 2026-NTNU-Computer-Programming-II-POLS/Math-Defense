<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'
import { formatScore } from '@/domain/formatters'
import FunctionPanel from './FunctionPanel.vue'

const g = useGameStore()

const phaseLabel = computed(() => {
  switch (g.phase) {
    case GamePhase.BUILD:       return 'Build Phase'
    case GamePhase.WAVE:        return `Wave ${g.wave}`
    case GamePhase.BUFF_SELECT: return 'Buff Selection'
    case GamePhase.BOSS_SHIELD: return 'Boss Battle!'
    case GamePhase.LEVEL_END:   return 'Victory!'
    case GamePhase.GAME_OVER:   return 'Game Over'
    default:                    return ''
  }
})

const goldStr = computed(() => String(g.gold).padStart(4, '0'))
const hpStr   = computed(() => `${g.hp} / ${g.maxHp}`)

// U-4 progress bar — no wave-total enemy count is surfaced today, so track
// the peak enemy count seen this wave and treat (peak - alive) / peak as
// completion. Resets on WAVE_START by keying off `g.wave`.
const wavePeak = ref(0)
watch(() => g.wave, () => { wavePeak.value = 0 })
watch(() => g.enemiesAlive, (n) => {
  if (n > wavePeak.value) wavePeak.value = n
})
const waveFillPct = computed(() => {
  if (wavePeak.value === 0) return 0
  return Math.max(0, Math.min(100, ((wavePeak.value - g.enemiesAlive) / wavePeak.value) * 100))
})

// U-7: pulse the phase label when it changes so transitions don't sneak
// past players focused on the canvas. Key bumps each transition so Vue
// re-runs the animation class.
const phasePulseKey = ref(0)
watch(() => g.phase, () => { phasePulseKey.value++ })

// Publish the rendered HUD height as a CSS variable on the overlay root so
// dependent overlays (BuildHint) can sit just below without hard-coded
// magic numbers that drift when HUD height changes (wrapping, responsive).
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
  hudRo = new ResizeObserver((entries) => {
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
      <span :key="phasePulseKey" class="hud-value phase phase-pulse">{{ phaseLabel }}</span>
    </div>

    <!-- Wave -->
    <div class="hud-item">
      <span class="hud-label">Level</span>
      <span class="hud-value">{{ g.level }}</span>
    </div>

    <!-- Gold -->
    <div class="hud-item" role="group" :aria-label="`Gold: ${g.gold}`">
      <span class="hud-label">Gold</span>
      <span class="hud-value gold">
        <span aria-hidden="true">⬡</span> {{ goldStr }}
      </span>
    </div>

    <!-- HP -->
    <div class="hud-item" role="group" :aria-label="`Hit points: ${g.hp} of ${g.maxHp}`">
      <span class="hud-label">HP</span>
      <span class="hud-value" :class="{ 'hp-low': g.hp <= 5 }">
        <span aria-hidden="true">♥</span>
        <span v-if="g.hp <= 5" aria-hidden="true" class="hp-warn-icon">⚠</span>
        {{ hpStr }}
      </span>
    </div>

    <!-- Wave progress (U-4): during WAVE phase show enemies-remaining + a
         small progress bar so the player knows how close the wave is to
         ending. Hidden outside WAVE to keep BUILD chrome uncluttered. -->
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
      <span class="hud-value score">{{ formatScore(g.score) }}</span>
    </div>
  </div>

  <FunctionPanel />
</template>

<style scoped>
.hud {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  background: linear-gradient(180deg, rgba(26,21,32,0.95), rgba(26,21,32,0.8));
  border-bottom: 1px solid var(--panel-border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 24px;
  font-family: var(--font-mono);
  z-index: var(--z-chrome);
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* T-2: labels bumped above the 12px accessibility floor. */
.hud-label {
  font-size: 11px;
  color: var(--axis);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hud-value {
  font-size: 14px;
  color: var(--gold);
  font-weight: bold;
}

.phase    { color: #e8dcc8; font-size: 12px; }
.gold     { color: var(--gold-bright); }
/* HP warning must not rely on colour alone — pair red with icon + weight (A-4) */
.hp-low   { color: var(--hp-red); font-weight: 900; }
.hp-warn-icon { margin: 0 2px; }
.score    { color: var(--gold); }

.score-item { margin-left: auto; }

/* U-4 wave progress */
.wave-progress { gap: 8px; }
.enemies-val { font-size: 13px; color: var(--hp-red); }
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

/* U-7: animate phase transitions so they don't go unnoticed. The :key
   binding re-inserts the span each phase change, retriggering the anim. */
.phase-pulse { animation: phase-pulse 520ms ease-out; }
@keyframes phase-pulse {
  0%   { transform: scale(1);    color: var(--gold-bright); text-shadow: 0 0 8px var(--gold-bright); }
  40%  { transform: scale(1.18); color: var(--gold-bright); text-shadow: 0 0 12px var(--gold-bright); }
  100% { transform: scale(1);    color: #e8dcc8; text-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .phase-pulse { animation: none; }
}

/* Narrow viewports (R-3): wrap so Score doesn't clip off-screen. */
@media (max-width: 640px) {
  .hud {
    height: auto;
    min-height: 48px;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 6px 12px;
  }
  .score-item {
    /* `margin-left:auto` on a flex row pushes Score past the edge when items
       wrap — force it to start a new row on narrow viewports instead. */
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
