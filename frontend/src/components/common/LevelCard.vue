<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const emit = defineEmits<{
  select: [levelId: number]
  close: []
}>()

interface LevelInfo {
  id: number
  name: string
  description: string
}

const LEVELS: LevelInfo[] = [
  { id: 1, name: 'Grassland',   description: 'Tutorial — learn y = mx + b' },
  { id: 2, name: 'Canyon',      description: 'Trig functions + parabolic paths' },
  { id: 3, name: 'Fortress',    description: 'Matrix links + integral cannons' },
  { id: 4, name: 'Dragon Lair', description: 'Boss + Fourier shield-break' },
]

const dialogRef = ref<HTMLElement | null>(null)

function handleKey(e: KeyboardEvent) {
  if (!dialogRef.value) return
  if (e.key === 'Escape') {
    e.stopImmediatePropagation()
    emit('close')
    return
  }
  if (e.key === 'Tab') {
    const focusable = Array.from(
      dialogRef.value.querySelectorAll<HTMLElement>('button')
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

onMounted(() => {
  nextTick(() => dialogRef.value?.querySelector<HTMLElement>('button')?.focus())
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<template>
  <div class="level-overlay">
    <div
      ref="dialogRef"
      class="level-select rune-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-select-title"
    >
      <div class="dialog-header">
        <h2 id="level-select-title" class="select-title">Select Level</h2>
        <button class="close-btn" aria-label="Close level select" @click="emit('close')">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div class="level-grid">
        <button
          v-for="lv in LEVELS"
          :key="lv.id"
          class="level-card"
          @click="emit('select', lv.id)"
        >
          <div class="lv-num">Level {{ lv.id }}</div>
          <div class="lv-name">{{ lv.name }}</div>
          <div class="lv-desc">{{ lv.description }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-header {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.close-btn {
  position: absolute;
  right: 0;
  background: none;
  border: none;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  cursor: pointer;
  font-size: var(--text-sm);
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover { color: var(--gold); text-shadow: var(--gold-shadow); }

.level-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-overlay);
}

.level-select {
  width: 680px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.select-title {
  font-size: var(--text-base);
  font-family: var(--font-mono);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 6px;
  text-align: center;
}

.level-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.level-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--grid-line);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.level-card:hover {
  border-color: var(--gold);
  background: rgba(212,168,64,0.08);
}

.lv-num  { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); letter-spacing: 2px; }
.lv-name { font-size: var(--text-md); color: var(--gold-bright); }
.lv-desc { font-size: var(--text-xs); color: #9a8a70; margin-top: 4px; }
</style>
