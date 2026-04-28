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

const arcStart = ref(0)
const arcEnd = ref(Math.PI / 2)
const restrict = ref(false)

watch(tower, (t) => {
  if (!t) return
  arcStart.value = t.arcStart ?? 0
  arcEnd.value = t.arcEnd ?? Math.PI / 2
  restrict.value = t.arcRestrict ?? false
}, { immediate: true })

function apply() {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.RADAR_ARC_CHANGED, {
    towerId: props.towerId,
    arcStart: arcStart.value,
    arcEnd: arcEnd.value,
    restrict: restrict.value,
  })
}

const arcStartDeg = computed({
  get: () => Math.round(arcStart.value * 180 / Math.PI),
  set: (v: number) => { arcStart.value = v * Math.PI / 180 },
})

const arcEndDeg = computed({
  get: () => Math.round(arcEnd.value * 180 / Math.PI),
  set: (v: number) => { arcEnd.value = v * Math.PI / 180 },
})
</script>

<template>
  <div class="radar-panel">
    <label class="param-row">
      <span class="param-label">Arc Start (deg)</span>
      <input v-model.number="arcStartDeg" type="range" min="0" max="360" step="5" class="slider" />
      <span class="param-val">{{ arcStartDeg }}°</span>
    </label>
    <label class="param-row">
      <span class="param-label">Arc End (deg)</span>
      <input v-model.number="arcEndDeg" type="range" min="0" max="360" step="5" class="slider" />
      <span class="param-val">{{ arcEndDeg }}°</span>
    </label>
    <label class="param-row">
      <input v-model="restrict" type="checkbox" />
      <span class="param-label">Restrict attacks to arc</span>
    </label>
    <button class="btn cast-btn" @click="apply">Apply</button>
  </div>
</template>

<style scoped>
.radar-panel { display: flex; flex-direction: column; gap: 8px; }
.param-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #e8dcc8; }
.param-label { flex: 1; }
.param-val { width: 40px; text-align: right; color: var(--gold); }
.slider { flex: 1; }
.cast-btn { font-size: 11px; padding: 6px 12px; align-self: flex-end; }
</style>
