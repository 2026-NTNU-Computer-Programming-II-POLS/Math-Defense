<script setup lang="ts">
import { computed } from 'vue'
import {
  COMPETENCIES,
  type BetaSummary,
  type Competency,
} from '@/services/assessmentService'

const props = defineProps<{
  posteriors: Record<Competency, BetaSummary>
  highlight?: Competency
}>()

interface BarRow {
  competency: Competency
  label: string
  pct: number
  highlighted: boolean
}

// Short labels — the dashboard row is dense and the full enum names overflow
// at 480px. Order tracks COMPETENCIES so bars line up with the backend enum.
const LABELS: Record<Competency, string> = {
  MAGIC: 'MAG',
  RADAR: 'RAD',
  MATRIX: 'MAT',
  LIMIT: 'LIM',
  CALCULUS: 'CAL',
  CHAIN_RULE: 'CHN',
  PROBABILITY: 'PRB',
}

const bars = computed<BarRow[]>(() =>
  COMPETENCIES.map((c) => ({
    competency: c,
    label: LABELS[c],
    pct: Math.round((props.posteriors[c]?.mean ?? 0.5) * 100),
    highlighted: props.highlight === c,
  })),
)
</script>

<template>
  <ul class="competency-bar" role="img" aria-label="Competency posteriors">
    <li
      v-for="row in bars"
      :key="row.competency"
      class="bar-col"
      :class="{ 'bar-col--lowest': row.highlighted }"
      :title="`${row.competency} ${row.pct}%`"
    >
      <span class="bar-track">
        <span class="bar-fill" :style="{ height: `${row.pct}%` }" />
      </span>
      <span class="bar-value">{{ row.pct }}</span>
      <span class="bar-label">{{ row.label }}</span>
    </li>
  </ul>
</template>

<style scoped>
.competency-bar {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--axis);
}

.bar-track {
  width: 100%;
  height: 32px;
  border: 1px solid var(--axis);
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: stretch;
}

.bar-fill {
  display: block;
  width: 100%;
  background: var(--gold);
}

.bar-value {
  font-family: monospace;
  font-size: 9px;
  color: var(--gold);
}

.bar-label {
  font-family: monospace;
  font-size: 9px;
  letter-spacing: 1px;
}

.bar-col--lowest .bar-track { border-color: var(--enemy-red); }
.bar-col--lowest .bar-fill { background: var(--enemy-red); }
.bar-col--lowest .bar-value,
.bar-col--lowest .bar-label { color: var(--enemy-red); }
</style>
