<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType } from '@/data/constants'

const gameStore = useGameStore()
const uiStore = useUiStore()

const barRef = ref<HTMLDivElement | null>(null)
let ro: ResizeObserver | null = null
// Declared up here so onBeforeUnmount (which sits before selectTower) can
// see it without a TDZ reference. selectTower assigns it.
let shakeTimer: number | null = null

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
  // F-BUG-9: cancel the unaffordable-shake timeout so it doesn't fire
  // against a torn-down component (Vue logs a warning, and shakingType
  // mutates after unmount needlessly).
  if (shakeTimer !== null) {
    window.clearTimeout(shakeTimer)
    shakeTimer = null
  }
})

// ── Category filter ───────────────────────────────────────────────────────
// Group towers by math discipline so the bar stays scannable as more towers
// unlock. "All" is the default; the player can narrow the list with chips.
type Category = 'all' | 'geometry' | 'functions' | 'algebra' | 'calculus'

const TOWER_CATEGORY: Record<TowerType, Exclude<Category, 'all'>> = {
  [TowerType.RADAR_A]: 'geometry',
  [TowerType.RADAR_B]: 'geometry',
  [TowerType.RADAR_C]: 'geometry',
  [TowerType.MAGIC]:   'functions',
  [TowerType.LIMIT]:   'functions',
  [TowerType.MATRIX]:  'algebra',
  [TowerType.CALCULUS]:'calculus',
}

const CATEGORY_LABELS: Record<Category, string> = {
  all:       'All',
  geometry:  'Geometry',
  functions: 'Functions',
  algebra:   'Algebra',
  calculus:  'Calculus',
}

const STORAGE_KEY = 'mg.towerBar.category'
const activeCategory = ref<Category>(loadCategory())

function loadCategory(): Category {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && v in CATEGORY_LABELS) return v as Category
  } catch { /* localStorage unavailable (private mode / SSR-ish) — fall through */ }
  return 'all'
}

function setCategory(c: Category) {
  activeCategory.value = c
  try { localStorage.setItem(STORAGE_KEY, c) } catch { /* ignore quota / disabled storage */ }
}

const unlockedTowers = computed(() =>
  Object.values(TOWER_DEFS).filter((def) => def.unlockLevel <= gameStore.level),
)

const availableTowers = computed(() => {
  if (activeCategory.value === 'all') return unlockedTowers.value
  return unlockedTowers.value.filter(
    (def) => TOWER_CATEGORY[def.type] === activeCategory.value,
  )
})

// Visible categories — only show chips for groups that actually have at
// least one unlocked tower, so early-game players don't see empty filters.
const visibleCategories = computed<Category[]>(() => {
  const present = new Set<Category>()
  for (const def of unlockedTowers.value) present.add(TOWER_CATEGORY[def.type])
  const out: Category[] = ['all']
  for (const c of ['geometry', 'functions', 'algebra', 'calculus'] as const) {
    if (present.has(c)) out.push(c)
  }
  // If only one real category is unlocked, the All chip is redundant — hide it.
  if (out.length === 2) return out.slice(1)
  return out
})

// If the persisted selection ends up filtering to nothing (e.g. player saved
// "calculus" then started a fresh run at level 1 where Calculus isn't
// unlocked), silently fall back so they see towers instead of an empty bar.
watch(visibleCategories, (vis) => {
  if (!vis.includes(activeCategory.value)) {
    activeCategory.value = vis.includes('all') ? 'all' : vis[0]
  }
}, { immediate: true })

function categoryCount(c: Category): number {
  if (c === 'all') return unlockedTowers.value.length
  return unlockedTowers.value.filter((def) => TOWER_CATEGORY[def.type] === c).length
}

// U-3: when the player clicks an unaffordable tower we used to still toggle
// selection; now we refuse and trigger a one-shot shake so the click isn't
// silent. Tracked per type so only the pressed button rattles.
const shakingType = ref<TowerType | null>(null)

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
    <div class="bar-label">Towers</div>

    <!-- Category chips: only render when ≥2 categories unlock to avoid
         taking up space early in the run when there's nothing to filter. -->
    <div v-if="visibleCategories.length > 1" class="category-chips" role="tablist">
      <button
        v-for="c in visibleCategories"
        :key="c"
        :class="['chip', { 'chip--active': activeCategory === c }]"
        role="tab"
        :aria-selected="activeCategory === c"
        :aria-label="`Show ${CATEGORY_LABELS[c]} towers (${categoryCount(c)})`"
        @click="setCategory(c)"
      >
        {{ CATEGORY_LABELS[c] }}
        <span class="chip-count">{{ categoryCount(c) }}</span>
      </button>
    </div>

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
        :data-tooltip="`${def.description} — ${def.mathConcept} · Cost: ${def.cost} gold\nOn the exam: ${def.examRelevance}`"
        :aria-label="`${def.nameEn}, ${def.mathConcept}, cost ${def.cost} gold${canAfford(def.cost) ? '' : ', unaffordable'}`"
        :aria-pressed="uiStore.selectedTowerType === def.type"
        :aria-disabled="!canAfford(def.cost)"
        @click="selectTower(def.type, def)"
      >
        <!-- Visual Redesign Phase 5a/5b: each tower type shows a miniature
             of its in-canvas instrument silhouette. Magic = parchment
             sinusoid; Radar A = sextant; Radar B = astrolabe rings;
             Radar C = brass telescope on tripod. Other tower types keep
             the hexagon until their own 5c–5e sub-phases land. -->
        <span class="tower-icon" :style="{ color: def.color }">
          <svg
            v-if="def.type === TowerType.MAGIC"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <path
              d="M2 8 Q 5 2 8 8 T 14 8 T 20 8 T 22 8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <svg
            v-else-if="def.type === TowerType.RADAR_A"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <path d="M3 13 A 10 10 0 0 1 21 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M12 13 L 19 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="12" cy="13" r="1.4" fill="currentColor"/>
          </svg>
          <svg
            v-else-if="def.type === TowerType.RADAR_B"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.75"/>
            <circle cx="12" cy="8" r="1.6" fill="currentColor"/>
          </svg>
          <svg
            v-else-if="def.type === TowerType.MATRIX"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <path d="M5 3 L 3 3 L 3 13 L 5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19 3 L 21 3 L 21 13 L 19 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="8" y="8.5" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">3</text>
            <text x="14" y="8.5" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">7</text>
            <text x="8" y="13" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">1</text>
            <text x="14" y="13" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">4</text>
          </svg>
          <svg
            v-else-if="def.type === TowerType.RADAR_C"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <line x1="6" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
            <line x1="12" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
            <line x1="18" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
            <line x1="4" y1="6" x2="20" y2="3" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
            <circle cx="20.5" cy="2.8" r="2" fill="currentColor"/>
          </svg>
          <svg
            v-else-if="def.type === TowerType.LIMIT"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <line x1="6" y1="14" x2="6" y2="3" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
            <line x1="18" y1="14" x2="18" y2="3" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
            <line x1="6" y1="4" x2="18" y2="4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="12" cy="6.5" r="1.8" fill="currentColor"/>
          </svg>
          <svg
            v-else-if="def.type === TowerType.CALCULUS"
            class="tower-icon-svg"
            viewBox="0 0 24 16"
            aria-hidden="true"
          >
            <path d="M3 14 Q 12 4 21 14" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            <text x="12" y="12" font-family="serif" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor">∫</text>
          </svg>
          <template v-else>⬡</template>
        </span>
        <span class="tower-name">
          <span class="tower-glyph" aria-hidden="true">{{ def.glyph }}</span>
          {{ def.nameEn }}
        </span>
        <span class="tower-cost" :class="{ 'cost-red': !canAfford(def.cost) }">
          {{ def.cost > 0 ? `⬡ ${def.cost}` : 'Free' }}
        </span>
      </button>
      <p v-if="availableTowers.length === 0" class="empty-msg">
        No towers in this category yet.
      </p>
    </div>
  </div>
</template>

<style scoped>
.tower-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: var(--bar-bg);
  border-top: 2px solid var(--gold);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: var(--z-chrome);
}

.bar-label {
  font-size: var(--text-xs); color: var(--axis);
  letter-spacing: 2px; text-transform: uppercase; white-space: nowrap;
}

.category-chips {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: nowrap;
}
.chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 4px 10px;
  font-size: var(--text-xs);
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  min-height: 32px;
}
.chip:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.chip:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 1px;
}
.chip--active {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--text-on-accent);
}
.chip-count {
  font-size: var(--text-xs);
  color: var(--axis);
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: bold;
}
.chip--active .chip-count {
  color: #ffffff;
  background: rgba(0, 0, 0, 0.5);
}

.empty-msg {
  font-size: var(--text-xs);
  color: var(--axis);
  margin: 0;
  padding: 0 12px;
  align-self: center;
  font-style: italic;
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
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  cursor: pointer;
  min-width: 90px;
  flex: 0 0 auto;
  transition: border-color 0.15s, background 0.15s;
}

.tower-btn:hover:not(.unaffordable) {
  border-color: var(--gold);
  background: rgba(255, 215, 0, 0.15);
}

/* Keyboard focus must be visually distinct from inert state (A-8) */
.tower-btn:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

/* U-6: stronger selection cue — double inset stroke + richer tint so the
   selected state reads clearly against the gold-on-dark palette. */
.tower-btn.selected {
  border-color: var(--gold);
  background: var(--gold);
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.4);
}

.tower-btn.selected .tower-name,
.tower-btn.selected .tower-cost,
.tower-btn.selected .tower-glyph {
  color: var(--text-on-accent);
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

.tower-icon {
  font-size: var(--text-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 16px;
}
.tower-icon-svg { width: 100%; height: 100%; }
.tower-name { font-size: var(--text-xs); color: #ffffff; letter-spacing: 1px; }
/* Per-tower glyph (WCAG 2.2 SC 1.4.1): an extra hue-independent cue so
   colour-blind players can identify tower type without relying on the
   colour of .tower-icon. Lives inline with the label. */
.tower-glyph {
  display: inline-block;
  margin-right: 4px;
  font-size: var(--text-xs);
  color: var(--gold-bright);
  font-weight: bold;
}
.tower-cost { font-size: var(--text-xs); color: var(--gold); font-family: var(--font-mono); }
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
  background: rgba(50, 68, 95, 0.97);
  border: 1px solid var(--gold);
  border-radius: 6px;
  color: #ffffff;
  font-size: var(--text-xs);
  line-height: 1.4;
  white-space: pre-line;
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
