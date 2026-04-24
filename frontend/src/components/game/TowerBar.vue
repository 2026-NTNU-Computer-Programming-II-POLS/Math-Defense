<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import type { TowerType } from '@/data/constants'

const gameStore = useGameStore()
const uiStore = useUiStore()

const barRef = ref<HTMLDivElement | null>(null)
let ro: ResizeObserver | null = null

// Publish the bar's rendered height as a CSS variable on the overlay root so
// BuildPanel / Start Wave can reactively sit above it even if the bar ever
// regains wrapping. Single-row scrolling keeps this at ~64px today, but the
// observer future-proofs against design changes.
function publishHeight(h: number): void {
  const el = barRef.value?.parentElement
  if (!el) return
  el.style.setProperty('--tower-bar-height', `${Math.round(h)}px`)
}

onMounted(() => {
  const el = barRef.value
  if (!el) return
  publishHeight(el.offsetHeight)
  ro = new ResizeObserver((entries) => {
    for (const entry of entries) publishHeight(entry.contentRect.height)
  })
  ro.observe(el)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

const availableTowers = computed(() =>
  Object.values(TOWER_DEFS).filter((def) => def.unlockLevel <= gameStore.level),
)

// U-3: when the player clicks an unaffordable tower we used to still toggle
// selection; now we refuse and trigger a one-shot shake so the click isn't
// silent. Tracked per type so only the pressed button rattles.
const shakingType = ref<TowerType | null>(null)
let shakeTimer: number | null = null

function selectTower(type: TowerType, def: { cost: number }): void {
  if (!canAfford(def.cost)) {
    shakingType.value = type
    if (shakeTimer !== null) window.clearTimeout(shakeTimer)
    shakeTimer = window.setTimeout(() => {
      shakingType.value = null
      shakeTimer = null
    }, 350)
    return
  }
  const newType = uiStore.selectedTowerType === type ? null : type
  uiStore.selectTower(newType)
  // TowerPlacementSystem reads uiStore directly via the injected getSelectedTowerType() — no manual sync needed
}

function canAfford(cost: number): boolean {
  return gameStore.gold >= cost
}
</script>

<template>
  <div ref="barRef" class="tower-bar">
    <div class="bar-label">魔法塔</div>
    <div class="tower-list">
      <button
        v-for="def in availableTowers"
        :key="def.type"
        :class="[
          'tower-btn',
          { selected: uiStore.selectedTowerType === def.type },
          { unaffordable: !canAfford(def.cost) },
          { shaking: shakingType === def.type },
        ]"
        :data-tooltip="`${def.description} — ${def.mathConcept} · 費用：${def.cost} 金`"
        :aria-label="`${def.nameEn}, ${def.mathConcept}, cost ${def.cost} gold${canAfford(def.cost) ? '' : ', unaffordable'}`"
        :aria-pressed="uiStore.selectedTowerType === def.type"
        :aria-disabled="!canAfford(def.cost)"
        @click="selectTower(def.type, def)"
      >
        <span class="tower-icon" :style="{ color: def.color }">⬡</span>
        <span class="tower-name">{{ def.nameEn }}</span>
        <span class="tower-cost" :class="{ 'cost-red': !canAfford(def.cost) }">
          {{ def.cost > 0 ? `⬡ ${def.cost}` : 'Free' }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tower-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(0deg, rgba(26,21,32,0.97), rgba(26,21,32,0.8));
  border-top: 1px solid var(--panel-border);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: var(--z-chrome);
}

.bar-label {
  font-size: 11px; color: var(--axis);
  letter-spacing: 2px; text-transform: uppercase; white-space: nowrap;
}

.tower-list {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 115, 66, 0.5) transparent;
}
.tower-list::-webkit-scrollbar { height: 6px; }
.tower-list::-webkit-scrollbar-track { background: transparent; }
.tower-list::-webkit-scrollbar-thumb {
  background: rgba(139, 115, 66, 0.45);
  border-radius: 3px;
}

.tower-btn {
  display: flex; flex-direction: column; align-items: center;
  gap: 3px; padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--grid-line);
  cursor: pointer;
  min-width: 90px;
  flex: 0 0 auto;
  transition: border-color 0.15s, background 0.15s;
}

.tower-btn:hover:not(.unaffordable) {
  border-color: var(--gold);
  background: rgba(212,168,64,0.08);
}

/* Keyboard focus must be visually distinct from inert state (A-8) */
.tower-btn:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

/* U-6: stronger selection cue — double inset stroke + richer tint so the
   selected state reads clearly against the gold-on-dark palette. */
.tower-btn.selected {
  border-color: var(--gold-bright);
  background: rgba(255,215,0,0.18);
  box-shadow:
    inset 0 0 0 2px var(--gold-bright),
    0 0 12px rgba(255, 215, 0, 0.35);
}

/* U-3: shake rejection cue for unaffordable clicks */
.tower-btn.shaking { animation: tower-shake 0.35s ease-out; }
@keyframes tower-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
@media (prefers-reduced-motion: reduce) {
  .tower-btn.shaking { animation: none; }
}

/* Unaffordable state: desaturate + distinct border instead of low opacity
   so text contrast stays above WCAG AA (A-5) */
.tower-btn.unaffordable {
  filter: grayscale(0.85);
  border-color: var(--hp-red);
  border-style: dashed;
  cursor: not-allowed;
}

.tower-icon { font-size: 18px; }
/* T-2: bump label sizes above the 12px accessibility floor. */
.tower-name { font-size: 11px; color: #e8dcc8; letter-spacing: 1px; }
.tower-cost { font-size: 12px; color: var(--gold); }
.cost-red   { color: var(--hp-red); }

/* Custom tooltip replacing native title (FE-11) */
.tower-btn[data-tooltip] { position: relative; }
.tower-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 220px;
  padding: 6px 10px;
  background: rgba(20, 16, 28, 0.96);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  color: #e8dcc8;
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: calc(var(--z-chrome) + 1);
}
.tower-btn[data-tooltip]:hover::after,
.tower-btn[data-tooltip]:focus-visible::after {
  opacity: 1;
}
</style>
