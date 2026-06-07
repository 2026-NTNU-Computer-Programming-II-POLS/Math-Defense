<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { calculateScore, type ScoreInput } from '@/domain/scoring/score-calculator'
import { sessionService } from '@/services/sessionService'

const props = defineProps<{ sessionId?: string | null; practiceMode?: boolean }>()
const uiStore = useUiStore()
// Backlog §20: any opt-in slider-fallback toggle implies the run is practice
// (the server flagged it as such). Fallback to the local toggle when the flag
// hasn't yet propagated from the session sync layer (e.g. legacy callers).
const isPractice = computed(() => props.practiceMode || uiStore.sliderFallbackEnabled)

const g = useGameStore()
const continueRef = ref<HTMLButtonElement | null>(null)
const reflectionText = ref('')
const reflectionStatus = ref<'idle' | 'submitting' | 'saved' | 'error'>('idle')
const reflectionError = ref('')
const REFLECTION_MAX = 2000

async function submitReflection() {
  if (!props.sessionId || reflectionStatus.value === 'submitting') return
  reflectionStatus.value = 'submitting'
  reflectionError.value = ''
  try {
    await sessionService.submitReflection(props.sessionId, reflectionText.value)
    reflectionStatus.value = 'saved'
  } catch (e) {
    reflectionStatus.value = 'error'
    reflectionError.value = e instanceof Error ? e.message : 'Failed to submit'
  }
}

const breakdown = computed(() => {
  const input: ScoreInput = {
    killValue: g.cumulativeKillValue,
    timeTotal: g.timeTotal,
    timeExcludePrepare: [...g.timeExcludePrepare],
    costTotal: g.costTotal,
    healthOrigin: g.healthOrigin,
    healthFinal: g.hp,
    initialAnswer: g.initialAnswer,
  }
  return calculateScore(input)
})

function fmt(v: number): string {
  return v.toFixed(2)
}

const emit = defineEmits<{ (e: 'close'): void }>()

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopImmediatePropagation()
    emit('close')
  }
  if (e.key === 'Tab' && continueRef.value) {
    e.preventDefault()
    continueRef.value.focus()
  }
}

onMounted(() => {
  nextTick(() => continueRef.value?.focus())
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<template>
  <div class="score-overlay">
    <div
      class="score-panel card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-title"
    >
      <div class="score-scroll">
      <div class="score-head">
        <div class="stars-row">
          <span v-for="i in g.starRating" :key="i" class="star filled">&#9733;</span>
          <span v-for="i in (5 - g.starRating)" :key="'e' + i" class="star empty">&#9734;</span>
        </div>
        <h1 id="score-title" class="title-main">Victory</h1>
        <p class="motto">Level cleared. Reflect to earn extra TP.</p>
      </div>

      <div class="section-label">Score Breakdown</div>
      <table class="tbl breakdown">
        <tbody>
          <tr>
            <td class="label">Enemies Defeated</td>
            <td class="value">{{ g.cumulativeKillValue }}</td>
          </tr>
          <tr>
            <td class="label">Active Time</td>
            <td class="value">{{ fmt(breakdown.activeTime) }}s</td>
          </tr>
          <tr>
            <td class="label">Gold Spent</td>
            <td class="value">{{ g.costTotal }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Speed Bonus</td>
            <td class="value">{{ fmt(breakdown.s1) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Efficiency Bonus</td>
            <td class="value">{{ fmt(breakdown.s2) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Combo Multiplier</td>
            <td class="value">{{ fmt(breakdown.k) }}</td>
          </tr>
          <tr>
            <td class="label">HP Remaining</td>
            <td class="value">{{ g.hp }} / {{ g.healthOrigin }}</td>
          </tr>
          <tr>
            <td class="label">Initial Answer</td>
            <td class="value">{{ g.initialAnswer === 1 ? 'Correct' : 'Wrong' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-score">
        <span class="total-label">Total Score</span>
        <span class="total-value">{{ fmt(breakdown.totalScore) }}</span>
      </div>

      <!-- §12.6: Checkpoint runs are tagged as practice on personal-best,
           and not eligible for class leaderboards. -->
      <p v-if="g.isCheckpointRun" class="practice-notice">
        Practice run (resumed from a checkpoint) — not eligible for class
        leaderboards.
      </p>
      <!-- Backlog §20.4: Score-Result view shows a notice when slider-fallback
           was enabled, so the player isn't surprised that the run is missing
           from the global leaderboard. -->
      <p v-else-if="isPractice" class="practice-notice">
        This run is in practice mode and not on the leaderboard.
      </p>

      <div v-if="sessionId" class="reflection">
        <div class="section-label">Reflection (optional)</div>
        <div class="field">
          <textarea
            id="reflection-text"
            v-model="reflectionText"
            class="reflection-input"
            :maxlength="REFLECTION_MAX"
            :disabled="reflectionStatus === 'submitting' || reflectionStatus === 'saved'"
            rows="3"
            placeholder="What strategy worked? What would you change next time?"
          />
          <div class="field-hint reflection-row">
            <span class="reflection-meta">{{ reflectionText.length }} / {{ REFLECTION_MAX }}</span>
            <span v-if="reflectionStatus === 'saved'" class="pill pill-success">Saved</span>
            <span v-if="reflectionStatus === 'error'" class="reflection-meta error">{{ reflectionError }}</span>
            <button
              class="btn btn-ghost btn-submit"
              type="button"
              :disabled="reflectionStatus === 'submitting' || reflectionStatus === 'saved'"
              @click="submitReflection"
            >
              {{ reflectionStatus === 'submitting' ? 'Saving…' : 'Submit Reflection' }}
            </button>
          </div>
        </div>
      </div>
      </div>

      <div class="btn-stack">
        <button
          ref="continueRef"
          class="btn btn-primary"
          @click="emit('close')"
        >
          <span class="label">Continue</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-overlay {
  position: absolute;
  inset: 0;
  background: rgba(79, 74, 72, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 20px;
}

/* `.card`, `.motto`, the `.pill` base and the `.btn` family are shared
   primitives in global.css (review §3.1). `.section-label` stays scoped —
   the name collides with a plainer in-canvas label of the same name. */

/* Modal panel — opaque + heavier shadow than the base .card surface. */
.score-panel {
  width: 100%;
  max-width: 640px;
  /* Cap to the 1280x720 `.game-view` box, NOT 90vh. The overlay lives inside
     `.game-view { overflow:hidden }`, whose box is only 720px tall (then CSS-
     scaled). A viewport-relative 90vh let the panel grow past that box, so its
     bottom — the Continue button — was silently clipped with no scrollbar.
     100% resolves against the overlay's definite (inset:0) height, so the
     panel always fits the box and scrolls its body internally instead. */
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  text-align: left;
  background: rgba(220, 229, 237, 0.96);
  box-shadow: var(--shadow-lg);
}

/* Scrollable body. The Continue footer (.btn-stack) sits outside this and
   stays pinned at the bottom, so it is always visible regardless of content. */
.score-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.score-head {
  text-align: center;
  margin-bottom: 18px;
}

.stars-row {
  font-size: var(--text-3xl);
  letter-spacing: 4px;
  line-height: 1;
  margin-bottom: 6px;
}

.star.filled { color: var(--terracotta); }
.star.empty { color: var(--line-strong); }

.title-main {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--charcoal);
  letter-spacing: 2px;
  line-height: 1.1;
}

/* ── Section labels ── */
.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 4px;
  color: var(--charcoal-soft);
  text-transform: uppercase;
  margin: 22px 0 12px;
}

.section-label::after {
  content: "";
  flex: 1;
  height: 0;
  border-top: 1px dashed var(--line-strong);
}

/* ── Breakdown table ── */
.tbl {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.tbl td {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}

.tbl tr:hover td {
  background: rgba(245, 250, 254, 0.5);
}

.breakdown .label {
  color: var(--charcoal);
}

.breakdown .value {
  text-align: right;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--charcoal);
}

.breakdown tr.formula .label,
.breakdown tr.formula .value {
  color: var(--teal-deep);
}

.total-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  margin-top: 4px;
  border-top: 1px dashed var(--line-strong);
}

.total-label {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 2px;
  color: var(--charcoal-soft);
  text-transform: uppercase;
}

.total-value {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--terracotta-deep);
}

.practice-notice {
  margin: 14px 0 0;
  padding: 8px 12px;
  border-left: 3px solid var(--slate);
  border-radius: 6px;
  background: rgba(107, 127, 148, 0.1);
  font-size: var(--text-xs);
  color: var(--slate-deep);
  line-height: 1.45;
}

/* ── Reflection ── */
.reflection {
  text-align: left;
}

.field {
  margin-bottom: 0;
}

.reflection-input {
  width: 100%;
  resize: vertical;
  min-height: 100px;
  padding: 12px 14px;
  font-family: var(--font-main);
  font-size: var(--text-base);
  background: rgba(245, 250, 254, 0.85);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  color: var(--charcoal);
  box-sizing: border-box;
}

.reflection-input:focus {
  outline: none;
  border-color: var(--terracotta);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(168, 188, 203, 0.28);
}

.field-hint {
  font-size: var(--text-xs);
  color: var(--muted);
  margin-top: 8px;
}

.reflection-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reflection-meta {
  font-size: var(--text-xs);
  color: var(--muted);
}

.reflection-meta.error { color: var(--clay-deep); }

.pill-success {
  background: rgba(126, 144, 119, 0.18);
  color: var(--sage-deep);
  border-color: rgba(126, 144, 119, 0.32);
}

/* ── Buttons — view-specific tweaks only (`.btn` family in global.css) ── */
.btn-submit {
  margin-left: auto;
}

.btn-stack {
  margin-top: 22px;
  flex-shrink: 0;
}
</style>
