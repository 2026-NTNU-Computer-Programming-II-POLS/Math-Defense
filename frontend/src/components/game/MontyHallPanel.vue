<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { gameCommands } from '@/services/gameCommandService'

const g = useGameStore()
const resultTimeout = ref(false)
const dialogRef = ref<HTMLElement | null>(null)

const mhState = computed(() => g.montyHallState)

const doors = computed(() => {
  const state = mhState.value
  if (!state) return []
  return Array.from({ length: state.doorCount }, (_, i) => ({
    index: i,
    isSelected: state.selectedDoor === i,
    isRevealed: state.revealedDoors.includes(i),
    isPrize: state.phase === 'result' && state.prizeIndex === i,
  }))
})

watch(mhState, (val) => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', handleKey)
  if (val) {
    nextTick(() => dialogRef.value?.querySelector<HTMLElement>('button:not([disabled])')?.focus())
    window.addEventListener('keydown', handleKey)
  }
}, { immediate: true })

onUnmounted(() => window.removeEventListener('keydown', handleKey))

function handleKey(e: KeyboardEvent) {
  if (!dialogRef.value) return
  if (e.key === 'Escape' && mhState.value?.phase === 'result') {
    e.stopImmediatePropagation()
    close()
    return
  }
  if (e.key === 'Tab') {
    const focusable = Array.from(
      dialogRef.value.querySelectorAll<HTMLElement>('button:not([disabled])')
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
}

function selectDoor(index: number): void {
  gameCommands.selectMontyHallDoor(index)
}

function decideSwitchOrKeep(doSwitch: boolean): void {
  gameCommands.decideMontyHallSwitch(doSwitch)
  resultTimeout.value = true
}

function close(): void {
  gameCommands.finishMontyHall()
  resultTimeout.value = false
}
</script>

<template>
  <div v-if="mhState" class="monty-hall-overlay">
    <div
      ref="dialogRef"
      class="monty-hall-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mh-title"
    >
      <h2 id="mh-title" class="mh-title">Monty Hall Challenge</h2>

      <!-- Select phase -->
      <p v-if="mhState.phase === 'select'" class="mh-prompt">Choose a door!</p>

      <!-- Switch phase -->
      <p v-if="mhState.phase === 'switch'" class="mh-prompt">
        {{ mhState.revealedDoors.length === 1
          ? `Door ${mhState.revealedDoors[0] + 1} was empty!`
          : `Doors ${mhState.revealedDoors.map(d => d + 1).join(', ')} were empty!`
        }} Do you want to switch?
      </p>

      <!-- Result phase -->
      <p v-if="mhState.phase === 'result'" class="mh-prompt" :class="{ won: mhState.won }">
        {{ mhState.won && mhState.reward ? `You won: ${mhState.reward.name}!` : 'Nothing behind this door...' }}
      </p>

      <!-- Doors -->
      <div class="doors">
        <button
          v-for="door in doors"
          :key="door.index"
          class="door"
          :class="{
            selected: door.isSelected,
            revealed: door.isRevealed,
            prize: door.isPrize && mhState?.phase === 'result',
          }"
          :disabled="mhState.phase !== 'select' || door.isRevealed"
          @click="selectDoor(door.index)"
        >
          <span class="door-number">{{ door.index + 1 }}</span>
          <span v-if="door.isRevealed" class="door-empty">Empty</span>
          <span v-if="door.isPrize && mhState?.phase === 'result'" class="door-prize">Prize!</span>
        </button>
      </div>

      <!-- Switch/Keep buttons -->
      <div v-if="mhState.phase === 'switch'" class="switch-buttons">
        <button class="btn btn-switch" @click="decideSwitchOrKeep(true)">Switch</button>
        <button class="btn btn-keep" @click="decideSwitchOrKeep(false)">Keep</button>
      </div>

      <!-- Close button -->
      <button v-if="mhState.phase === 'result'" class="btn btn-close" @click="close">Continue</button>
    </div>
  </div>
</template>

<style scoped>
.monty-hall-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.monty-hall-panel {
  background: var(--overlay-panel-bg);
  border: 2px solid var(--gold);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 24px 32px;
  text-align: center;
  min-width: 360px;
  font-family: var(--font-mono);
}

.mh-title {
  color: var(--gold-deep);
  font-size: var(--text-md);
  margin: 0 0 12px;
}

.mh-prompt {
  color: var(--overlay-text);
  font-size: var(--text-sm);
  margin: 0 0 16px;
}

.mh-prompt.won {
  color: var(--sage-deep);
  font-weight: bold;
}

.doors {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 16px;
}

.door {
  width: 64px;
  height: 80px;
  border: 2px solid var(--panel-border);
  border-radius: 6px;
  background: var(--gold-tint);
  color: var(--overlay-text);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: bold;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: transform 150ms, background 150ms;
}

.door:hover:not(:disabled) {
  transform: scale(1.08);
  background: var(--gold-tint-select);
}

.door.selected {
  border-color: var(--gold-deep);
  box-shadow: 0 0 8px var(--gold);
}

.door.revealed {
  opacity: 0.3;
  cursor: not-allowed;
}

.door.prize {
  border-color: var(--sage-deep);
  background: rgba(126, 144, 119, 0.18);
}

.door-number { font-size: var(--text-lg); }
.door-empty { font-size: var(--text-2xs); color: var(--hp-red); }
.door-prize { font-size: var(--text-2xs); color: var(--sage-deep); }

.switch-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 8px 20px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background 120ms;
}

.btn-switch {
  background: rgba(111, 138, 161, 0.16);
  color: var(--terracotta-deep);
  border-color: var(--terracotta-deep);
}

.btn-keep {
  background: var(--gold-tint-select);
  color: var(--gold-deep);
  border-color: var(--gold-deep);
}

.btn-close {
  background: rgba(126, 144, 119, 0.18);
  color: var(--sage-deep);
  border-color: var(--sage-deep);
}

.btn:hover {
  background: var(--overlay-cell-hover);
}

@media (prefers-reduced-motion: reduce) {
  .door {
    transition: none;
  }
  .door:hover:not(:disabled) {
    transform: none;
  }
}
</style>
