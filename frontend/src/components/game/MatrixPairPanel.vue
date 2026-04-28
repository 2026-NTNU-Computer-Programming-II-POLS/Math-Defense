<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TowerType, Events } from '@/data/constants'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const pair = computed(() => {
  const t = tower.value
  if (!t?.matrixPairId) return null
  const engine = gameStore.getEngine()
  return engine?.towers.find((o) => o.id === t.matrixPairId) ?? null
})

const dotProduct = computed(() => {
  const t = tower.value
  const p = pair.value
  if (!t || !p) return null
  return t.x * p.x + t.y * p.y
})

const availablePairs = computed(() => {
  const t = tower.value
  if (!t) return []
  const engine = gameStore.getEngine()
  if (!engine) return []
  return engine.towers.filter(
    (o) => o.id !== t.id && o.type === TowerType.MATRIX && !o.matrixPairId,
  )
})

function pairWith(pairId: string) {
  const engine = gameStore.getEngine()
  if (!engine) return
  const t = tower.value
  if (t?.matrixPairId) {
    const old = engine.towers.find((o) => o.id === t.matrixPairId)
    if (old) old.matrixPairId = null
  }
  engine.eventBus.emit(Events.MATRIX_PAIR_CHANGED, { towerId: props.towerId, pairId })
  if (t) t.configured = true
}
</script>

<template>
  <div class="matrix-panel">
    <div v-if="pair" class="pair-info">
      <p class="info-line">Paired with tower at ({{ pair.x }}, {{ pair.y }})</p>
      <p class="info-line">
        Dot product: [{{ tower?.x }}, {{ tower?.y }}] · [{{ pair.x }}, {{ pair.y }}] =
        <strong>{{ dotProduct }}</strong>
      </p>
    </div>
    <div v-else class="no-pair">
      <p class="info-line">No pair — place another Matrix tower to auto-pair</p>
      <div v-if="availablePairs.length > 0">
        <p class="section-label">Or pair manually:</p>
        <button
          v-for="t in availablePairs"
          :key="t.id"
          class="btn"
          @click="pairWith(t.id)"
        >Pair with ({{ t.x }}, {{ t.y }})</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.matrix-panel { display: flex; flex-direction: column; gap: 6px; }
.info-line { font-size: 11px; color: #e8dcc8; margin: 0; }
.info-line strong { color: var(--gold); }
.section-label { font-size: 10px; color: var(--axis); margin: 4px 0 2px; }
.no-pair .btn { font-size: 10px; margin-top: 4px; }
</style>
