<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const arcStartDeg = ref(0)
const arcEndDeg = ref(90)
const restrict = ref(false)

watch(tower, (t) => {
  if (!t) return
  arcStartDeg.value = Math.round((t.arcStart ?? 0) * 180 / Math.PI)
  arcEndDeg.value = Math.round((t.arcEnd ?? Math.PI / 2) * 180 / Math.PI)
  restrict.value = t.arcRestrict ?? false
}, { immediate: true })

function snapDeg(v: number): number {
  if (!Number.isFinite(v)) return 0
  const clamped = Math.max(0, Math.min(360, v))
  return Math.round(clamped / 5) * 5
}

// A restricted arc whose start and end snap to the same angle has zero width:
// isAngleInArc(angle, s, s) is true only for the exact ray `s`, so the tower
// would filter out every enemy and fire at nothing — a silent self-disable.
// Compare the SNAPPED values (Apply snaps before emitting) so the warning and
// the guard agree with what would actually be sent. Restrict-off is exempt: a
// zero-width arc there only means "no ×1.5 focus zone", the tower still fires
// everywhere. 0 vs 360 is NOT degenerate (full circle) and stays allowed.
const arcInvalid = computed(() =>
  restrict.value && snapDeg(arcStartDeg.value) === snapDeg(arcEndDeg.value),
)

function apply() {
  const engine = gameStore.getEngine()
  if (!engine) return
  const startDeg = snapDeg(arcStartDeg.value)
  const endDeg = snapDeg(arcEndDeg.value)
  arcStartDeg.value = startDeg
  arcEndDeg.value = endDeg
  // Refuse a zero-width restricted arc rather than silently disabling the tower.
  if (restrict.value && startDeg === endDeg) return
  engine.eventBus.emit(Events.RADAR_ARC_CHANGED, {
    towerId: props.towerId,
    arcStart: startDeg * Math.PI / 180,
    arcEnd: endDeg * Math.PI / 180,
    restrict: restrict.value,
  })
}
</script>

<template>
  <div class="radar-panel">
    <label class="param-row">
      <span class="param-label">Arc Start (deg)</span>
      <input
        v-model.number="arcStartDeg"
        type="number"
        min="0"
        max="360"
        step="5"
        class="num-input"
        data-testid="radar-arc-start"
      />
      <span class="param-val">°</span>
    </label>
    <label class="param-row">
      <span class="param-label">Arc End (deg)</span>
      <input
        v-model.number="arcEndDeg"
        type="number"
        min="0"
        max="360"
        step="5"
        class="num-input"
        data-testid="radar-arc-end"
      />
      <span class="param-val">°</span>
    </label>
    <label class="param-row">
      <input v-model="restrict" type="checkbox" />
      <span class="param-label">Restrict attacks to arc</span>
    </label>
    <p v-if="arcInvalid" class="arc-warning" data-testid="radar-arc-warning">
      A restricted arc needs a non-zero width — set Arc Start and Arc End to different angles.
    </p>
    <button
      class="btn cast-btn"
      data-testid="radar-apply"
      :disabled="arcInvalid"
      @click="apply"
    >Apply</button>
  </div>
</template>

<style scoped>
.radar-panel { display: flex; flex-direction: column; gap: 8px; }
.param-row { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--charcoal); }
.param-label { flex: 1; }
.param-val { width: 16px; text-align: left; color: var(--terracotta-deep); font-weight: 700; }
.num-input {
  width: 64px;
  padding: 6px 8px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  background: var(--cream-soft);
  color: var(--charcoal);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  text-align: right;
}
.num-input:focus { outline: none; border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(168, 188, 203, 0.28); }
.cast-btn { font-size: var(--text-xs); padding: 6px 12px; align-self: flex-end; }
.cast-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.arc-warning { margin: 0; font-size: var(--text-xs); line-height: 1.3; color: var(--terracotta-deep); }
</style>
