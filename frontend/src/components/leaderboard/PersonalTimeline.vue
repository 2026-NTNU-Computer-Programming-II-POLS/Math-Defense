<script setup lang="ts">
import { computed } from 'vue'
import type { PersonalHistoryEntry } from '@/services/leaderboardService'
import { formatScore } from '@/utils/formatters'

// Self-referential mastery framing (Ames 1992; Ramirez 2018; Ryan/Rigby/Przybylski
// 2006) — the chart shows the player's own scores over time, never compared to
// peers. Personal-best markers (★) make the mastery progression legible without
// introducing performance-goal cues.

interface Props {
  entries: PersonalHistoryEntry[]
}
const props = defineProps<Props>()

const W = 640
const H = 220
const PAD_L = 40
const PAD_R = 16
const PAD_T = 16
const PAD_B = 32

interface Point {
  x: number
  y: number
  entry: PersonalHistoryEntry
}

// API delivers newest-first; the timeline reads left-to-right (oldest → newest)
// so reverse for plotting.
const chronological = computed<PersonalHistoryEntry[]>(() => [...props.entries].reverse())

const maxScore = computed(() => {
  const scores = chronological.value.map(e => e.score)
  return scores.length ? Math.max(...scores, 1) : 1
})

const points = computed<Point[]>(() => {
  const list = chronological.value
  if (list.length === 0) return []
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const denom = list.length === 1 ? 1 : list.length - 1
  return list.map((entry, i) => {
    const x = PAD_L + (innerW * i) / denom
    const y = PAD_T + innerH - (innerH * entry.score) / maxScore.value
    return { x, y, entry }
  })
})

const polylinePoints = computed(() =>
  points.value.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
)

const yAxisLabel = computed(() => formatScore(maxScore.value))

const personalBestPoints = computed(() => points.value.filter(p => p.entry.is_personal_best))
</script>

<template>
  <div class="pt-wrap">
    <div v-if="entries.length === 0" class="pt-empty">
      Play a session to populate this view
    </div>
    <svg
      v-else
      class="pt-svg"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="Personal score timeline"
    >
      <line
        :x1="PAD_L" :y1="PAD_T"
        :x2="PAD_L" :y2="H - PAD_B"
        class="pt-axis"
      />
      <line
        :x1="PAD_L" :y1="H - PAD_B"
        :x2="W - PAD_R" :y2="H - PAD_B"
        class="pt-axis"
      />

      <text :x="PAD_L - 6" :y="PAD_T + 4" class="pt-axis-label" text-anchor="end">{{ yAxisLabel }}</text>
      <text :x="PAD_L - 6" :y="H - PAD_B" class="pt-axis-label" text-anchor="end">0</text>

      <polyline
        v-if="points.length > 1"
        :points="polylinePoints"
        class="pt-line"
        fill="none"
      />

      <circle
        v-for="p in points"
        :key="`dot-${p.entry.id}`"
        :cx="p.x"
        :cy="p.y"
        r="3"
        class="pt-dot"
      />

      <g v-for="p in personalBestPoints" :key="`pb-${p.entry.id}`">
        <text
          :x="p.x"
          :y="p.y - 8"
          class="pt-pb-marker"
          text-anchor="middle"
          aria-label="Personal best"
        >★</text>
      </g>
    </svg>

    <ul v-if="entries.length > 0" class="pt-list">
      <li v-for="e in entries" :key="e.id" class="pt-row">
        <span class="pt-row-pb">
          <span v-if="e.is_personal_best" class="pt-pb-marker">★</span>
        </span>
        <span class="pt-row-level">Lv.{{ e.level }}</span>
        <span class="pt-row-score">{{ formatScore(e.score) }}</span>
        <span class="pt-row-date">{{ new Date(e.created_at).toLocaleDateString() }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pt-wrap { display: flex; flex-direction: column; gap: 16px; }
.pt-empty { text-align: center; color: var(--axis); padding: 48px 16px; }

.pt-svg { width: 100%; max-width: 640px; height: auto; }
.pt-axis { stroke: var(--grid-line); stroke-width: 1; }
.pt-axis-label { fill: var(--axis); font-size: 10px; }
.pt-line { stroke: var(--gold); stroke-width: 1.5; }
.pt-dot { fill: var(--gold-bright); }
.pt-pb-marker { fill: var(--gold); color: var(--gold); font-size: 14px; font-weight: bold; }

.pt-list { list-style: none; padding: 0; margin: 0; }
.pt-row {
  display: grid;
  grid-template-columns: 24px 60px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--grid-line);
  font-size: 12px;
}
.pt-row-pb { width: 24px; text-align: center; }
.pt-row-level { color: var(--axis); }
.pt-row-score { color: var(--gold-bright); font-weight: bold; }
.pt-row-date { color: var(--axis); font-size: 11px; }
</style>
