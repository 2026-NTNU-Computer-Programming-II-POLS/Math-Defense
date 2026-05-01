<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { generateMagicCandidates } from '@/domain/tower/magic-candidates'
import type { MagicMode } from '@/data/tower-defs'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const candidates = computed(() => {
  const t = tower.value
  if (!t) return []
  return generateMagicCandidates(t.id, t.x, t.y)
})

function selectFunction(index: number) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_FUNCTION_SELECTED, { towerId: props.towerId, index })
}

function toggleMode(mode: MagicMode) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_MODE_CHANGED, { towerId: props.towerId, mode })
}
</script>

<template>
  <div class="magic-panel">
    <div v-if="tower && (tower.magicFunctionIndex === undefined || tower.magicFunctionIndex < 0)" class="fn-select">
      <p class="section-label">Choose a function curve:</p>
      <button
        v-for="c in candidates"
        :key="c.label"
        class="btn fn-btn"
        @click="selectFunction(candidates.indexOf(c))"
      >{{ c.label }}</button>
    </div>

    <div v-if="tower && tower.magicFunctionIndex !== undefined && tower.magicFunctionIndex >= 0" class="mode-select">
      <p class="section-label">Zone Mode:</p>
      <div class="mode-btns">
        <button
          class="btn"
          :class="{ active: tower.magicMode === 'debuff' }"
          @click="toggleMode('debuff')"
        >Debuff Enemies</button>
        <button
          class="btn"
          :class="{ active: tower.magicMode === 'buff' }"
          @click="toggleMode('buff')"
        >Buff Towers</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.magic-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: 11px; color: var(--axis); margin: 0; }
.fn-select { display: flex; flex-direction: column; gap: 4px; }
.fn-btn { font-size: 11px; padding: 6px 10px; }
.mode-btns { display: flex; gap: 6px; }
.mode-btns .btn { flex: 1; font-size: 10px; padding: 6px; }
.mode-btns .btn.active { background: var(--gold); color: var(--stone-dark); }
</style>
