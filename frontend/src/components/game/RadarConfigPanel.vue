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

function apply() {
  const engine = gameStore.getEngine()
  if (!engine) return
  const startDeg = snapDeg(arcStartDeg.value)
  const endDeg = snapDeg(arcEndDeg.value)
  arcStartDeg.value = startDeg
  arcEndDeg.value = endDeg
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
    <button class="btn cast-btn" data-testid="radar-apply" @click="apply">Apply</button>
  </div>
</template>

<style scoped>
.radar-panel { display: flex; flex-direction: column; gap: 8px; }
.param-row { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: #ffffff; }
.param-label { flex: 1; }
.param-val { width: 16px; text-align: left; color: var(--gold); }
.num-input {
  width: 64px;
  padding: 3px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  background: var(--stone-dark);
  color: #ffffff;
  border: 1px solid var(--gold);
  border-radius: 4px;
  text-align: right;
}
.num-input:focus { outline: 1px solid var(--gold); }
.cast-btn { font-size: var(--text-xs); padding: 6px 12px; align-self: flex-end; }
</style>
