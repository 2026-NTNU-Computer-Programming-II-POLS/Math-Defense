<script setup lang="ts">
import { computed } from 'vue'
import type { CountdownReadout } from '@/composables/useCountdown'

type Tier = 'safe' | 'warning' | 'urgent' | 'expired'

const props = withDefaults(defineProps<{
  readout: CountdownReadout
  totalDurationMs: number
  settled: boolean
  warningHours?: number
  urgentHours?: number
}>(), {
  warningHours: 24,
  urgentHours: 6,
})

const tier = computed<Tier>(() => {
  if (props.settled || props.readout.isExpired) return 'expired'
  if (props.readout.hours >= props.warningHours) return 'safe'
  if (props.readout.hours >= props.urgentHours) return 'warning'
  return 'urgent'
})

const percent = computed(() => {
  if (props.totalDurationMs <= 0) return 0
  return Math.max(0, Math.min(100, (props.readout.timeRemainingMs / props.totalDurationMs) * 100))
})

const display = computed(() => {
  if (props.settled) return 'Settled'
  if (props.readout.isExpired) return 'Expired'
  const { hours, minutes, seconds } = props.readout
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
})
</script>

<template>
  <div class="deadline-progress" :data-tier="tier" role="status" :aria-label="`Deadline in ${display}`">
    <div class="timer-line">
      <span class="icon" aria-hidden="true">⏱</span>
      <span class="text">{{ settled ? 'Settled' : readout.isExpired ? 'Deadline passed' : `Deadline in ${display}` }}</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" :style="{ width: percent + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.deadline-progress { display: flex; flex-direction: column; gap: 6px; }
.timer-line { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--axis); text-shadow: var(--gold-shadow); }
.icon { font-size: 12px; }
.bar-track {
  height: 6px;
  background: rgba(107, 107, 107, 0.3);
  border: 1px solid var(--axis);
  overflow: hidden;
}
.bar-fill { height: 100%; transition: width 0.3s ease, background-color 0.5s ease; }
[data-tier="safe"] .text { color: #6abf85; }
[data-tier="warning"] .text { color: #d8a848; }
[data-tier="urgent"] .text { color: #d05050; }
[data-tier="expired"] .text { color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; }
[data-tier="safe"]    .bar-fill { background: linear-gradient(90deg, #4aab6e, #3a9b5e); }
[data-tier="warning"] .bar-fill { background: linear-gradient(90deg, #c89848, #b88838); }
[data-tier="urgent"]  .bar-fill { background: linear-gradient(90deg, #b84040, #a83030); animation: pulse 1s infinite; }
[data-tier="expired"] .bar-fill { background: linear-gradient(90deg, #6b6b6b, #5b5b5b); }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@media (prefers-reduced-motion: reduce) {
  .bar-fill { animation: none !important; transition: none; }
}
</style>
