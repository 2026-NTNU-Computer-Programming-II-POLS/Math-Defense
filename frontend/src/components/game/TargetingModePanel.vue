<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import type { TargetingMode } from '@/entities/types'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

interface ModeOption {
  mode: TargetingMode
  label: string
  desc: string
  icon: string
}

const modes: ModeOption[] = [
  { mode: 'first',     label: 'First',     desc: 'Closest to goal',     icon: '⏵' },
  { mode: 'last',      label: 'Last',      desc: 'Furthest from goal',  icon: '⏴' },
  { mode: 'closest',   label: 'Closest',   desc: 'Nearest to tower',    icon: '◎' },
  { mode: 'strongest', label: 'Strongest', desc: 'Highest current HP',  icon: '✦' },
]

// Towers are plain JS objects, not reactive. Reading tower.targetingMode in
// a computed wouldn't re-evaluate when the system mutates it post-emit.
// Use a local ref as the source of truth for the active highlight; sync it
// from the tower whenever we switch panels (towerId change).
const currentMode = ref<TargetingMode>(readModeFromTower())

function readModeFromTower(): TargetingMode {
  const engine = gameStore.getEngine()
  const t = engine?.towers.find((x) => x.id === props.towerId)
  return t?.targetingMode ?? 'first'
}

watch(
  () => props.towerId,
  () => { currentMode.value = readModeFromTower() },
)

function setMode(mode: TargetingMode) {
  if (mode === currentMode.value) return
  const engine = gameStore.getEngine()
  if (!engine) return
  // Optimistic local update — keeps the highlight responsive without waiting
  // for a reactive round-trip through the engine's plain-JS tower object.
  currentMode.value = mode
  engine.eventBus.emit(Events.TOWER_TARGETING_CHANGED, {
    towerId: props.towerId,
    mode,
  })
}
</script>

<template>
  <div class="targeting-panel">
    <p class="section-label">Targeting</p>
    <div class="mode-grid">
      <button
        v-for="opt in modes"
        :key="opt.mode"
        :class="['mode-btn', { active: currentMode === opt.mode }]"
        :aria-pressed="currentMode === opt.mode"
        :aria-label="`${opt.label}: ${opt.desc}`"
        :title="opt.desc"
        @click="setMode(opt.mode)"
      >
        <span class="mode-icon" aria-hidden="true">{{ opt.icon }}</span>
        <span class="mode-label">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.targeting-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-label {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin: 0;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px;
  background: rgba(245, 250, 254, 0.78);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--charcoal-soft);
  cursor: pointer;
  font-family: var(--font-mono);
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  min-height: 44px;
}

.mode-btn:hover {
  border-color: var(--terracotta);
  background: #fff;
  color: var(--charcoal);
}

.mode-btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 1px;
}

.mode-btn.active {
  border-color: var(--terracotta-deep);
  background: linear-gradient(135deg, var(--terracotta), var(--terracotta-soft));
  color: #fff;
  box-shadow: 0 4px 12px rgba(79, 74, 72, 0.24);
}

.mode-icon { font-size: var(--text-sm); }
.mode-label { font-size: var(--text-xs); letter-spacing: 0.5px; text-transform: uppercase; }
</style>
