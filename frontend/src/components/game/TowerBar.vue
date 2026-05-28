<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType } from '@/data/constants'

const gameStore = useGameStore()
const uiStore = useUiStore()

// Per-tower card accent (mockup). Muted Morandi hues — softer than the bright
// on-canvas Colors.* / def.color. The icon takes this colour on an idle card;
// a selected card fills with it and flips its text/icon to white.
const TOWER_CARD_COLOR: Record<TowerType, string> = {
  [TowerType.MAGIC]:    '#9C8BB0',
  [TowerType.RADAR_A]:  '#8FAA77',
  [TowerType.RADAR_B]:  '#7D9BBE',
  [TowerType.RADAR_C]:  '#B07E5C',
  [TowerType.MATRIX]:   '#C9BB6E',
  [TowerType.LIMIT]:    '#C9A99E',
  [TowerType.CALCULUS]: '#9C958D',
}

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
  ro = new ResizeObserver((entries, _observer) => {
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
    <!-- Header: the TOWERS label shares a 2-column grid with the category
         chips so they read TOWERS/All, Geometry/Functions, Algebra/Calculus
         down the strip (mockup). Chips only render when ≥2 categories unlock
         to avoid taking up space early in the run with nothing to filter. -->
    <div class="bar-head" role="tablist">
      <span class="bar-label" role="presentation">Towers</span>
      <template v-if="visibleCategories.length > 1">
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
      </template>
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
        :style="uiStore.selectedTowerType === def.type
          ? { background: TOWER_CARD_COLOR[def.type], borderColor: TOWER_CARD_COLOR[def.type] }
          : null"
        @click="selectTower(def.type, def)"
      >
        <!-- Visual Redesign Phase 5a/5b: each tower type shows a miniature
             of its in-canvas instrument silhouette. Magic = parchment
             sinusoid; Radar A = sextant; Radar B = astrolabe rings;
             Radar C = brass telescope on tripod. Other tower types keep
             the hexagon until their own 5c–5e sub-phases land. -->
        <span
          class="tower-icon"
          :style="{ color: uiStore.selectedTowerType === def.type ? '#fff' : TOWER_CARD_COLOR[def.type] }"
        >
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
/* Bottom tower bar — Morandi foot strip (mockup .gh-foot) */
.tower-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(0deg, rgba(220, 229, 237, 0.98), rgba(200, 210, 220, 0.94));
  border-top: 1px solid var(--line-strong);
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: var(--z-chrome);
}

.bar-label {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  letter-spacing: 2.5px;
  text-transform: uppercase;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-self: center;
  padding-left: 8px;
}

/* Header grid: the TOWERS label occupies the first cell and the category
   chips fill the rest, two per row, so the bar reads TOWERS/All,
   Geometry/Functions, Algebra/Calculus down at most three lines (mockup)
   instead of stretching across one long row. */
.bar-head {
  display: grid;
  grid-template-columns: repeat(2, auto);
  align-content: center;
  gap: 4px;
  flex-shrink: 0;
}
/* Category filter chips (mockup .tcat) */
.chip {
  background: rgba(245, 250, 254, 0.7);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 0.625rem;
  color: var(--charcoal-soft);
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  min-height: 20px;
}
.chip:hover {
  border-color: var(--gold);
  color: var(--gold-deep);
}
.chip:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 1px;
}
.chip--active {
  border-color: var(--gold-deep);
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  color: #fff;
  box-shadow: 0 2px 6px rgba(122, 113, 86, 0.34);
}
.chip-count {
  font-size: 0.625rem;
  color: var(--charcoal-soft);
  background: rgba(79, 74, 72, 0.08);
  padding: 0 4px;
  border-radius: 8px;
  font-weight: 700;
}
.chip--active .chip-count {
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
}

.empty-msg {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  margin: 0;
  padding: 0 12px;
  align-self: center;
  font-style: italic;
}

/* Tower cards laid out in a single row. Columns are a fixed width (not 1fr)
   so each card stays the same size regardless of how many towers the active
   category shows or which tower is selected, and the width is generous
   enough that every name fits on one line inside the card frame. */
.tower-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 5px;
  flex: 1;
  min-width: 0;
  border-left: 1px dashed var(--line);
  padding-left: 10px;
  margin-left: 6px;
}

/* Tower card (mockup .tcard) — fixed 10px radius. No rule competes for the
   tower-btn border-radius, so no !important specificity hack is needed. */
.tower-btn {
  display: flex; flex-direction: column; align-items: center;
  gap: 1px; padding: 3px 8px;
  background: rgba(245, 250, 254, 0.86);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  min-width: 0;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, transform 0.14s ease;
}

.tower-btn:hover:not(.unaffordable) {
  border-color: var(--terracotta);
  background: #fff;
  transform: translateY(-1px);
}

/* Keyboard focus must be visually distinct from inert state (A-8) */
.tower-btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
}

/* Selected cue — the card fills with the tower's own colour (inline :style
   binding) and flips its text + icon to white. */
.tower-btn.selected {
  box-shadow: 0 4px 12px rgba(79, 74, 72, 0.24);
}

.tower-btn.selected .tower-name,
.tower-btn.selected .tower-cost,
.tower-btn.selected .tower-glyph {
  color: #fff;
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
  border-color: var(--clay-deep);
  border-style: dashed;
  cursor: not-allowed;
}

.tower-icon {
  font-size: var(--text-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 14px;
}
.tower-icon-svg { width: 100%; height: 100%; }
.tower-name {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: #222;
  letter-spacing: 0.5px;
  font-weight: 700;
  white-space: nowrap;
  width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Per-tower glyph (WCAG 2.2 SC 1.4.1): an extra hue-independent cue so
   colour-blind players can identify tower type without relying on the
   colour of .tower-icon. Lives inline with the label. */
.tower-glyph {
  display: inline-block;
  margin-right: 4px;
  font-size: var(--text-xs);
  color: var(--terracotta-deep);
  font-weight: bold;
}
.tower-cost { font-size: var(--text-xs); color: var(--gold-deep); font-family: var(--font-mono); }
.cost-red   { color: var(--clay-deep); }

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
  background: rgba(79, 74, 72, 0.95);
  border: 1px solid var(--terracotta-deep);
  border-radius: 8px;
  color: #F4EFE3;
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
