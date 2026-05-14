<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { PURCHASABLE_BUFFS, type BuffCategory } from '@/data/buff-defs'
import { Events } from '@/data/constants'

type Category = 'all' | BuffCategory

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  tower: 'Tower',
  enemy: 'Enemy',
  defense: 'Defense',
  economy: 'Gold',
}
const CATEGORY_ORDER: ReadonlyArray<Category> = ['all', 'tower', 'enemy', 'defense', 'economy']

const STORAGE_KEY = 'mg.shopPanel.category'

function loadCategory(): Category {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && v in CATEGORY_LABELS) return v as Category
  } catch { /* localStorage unavailable (private mode / SSR-ish) — fall through */ }
  return 'all'
}

const g = useGameStore()
const collapsed = ref(true)
const activeCategory = ref<Category>(loadCategory())

function setCategory(c: Category): void {
  activeCategory.value = c
  try { localStorage.setItem(STORAGE_KEY, c) } catch { /* ignore quota / disabled storage */ }
}

// Active buff lookup keyed by effectId. PURCHASABLE_BUFFS rows match active
// entries via effectId (not buff-def id) because BuffSystem fingerprints the
// active entry with `${def.id}_${Date.now()}`.
const activeByEffectId = computed(() => {
  const m = new Map<string, (typeof g.activeBuffs)[number]>()
  for (const ab of g.activeBuffs) m.set(ab.effectId, ab)
  return m
})

// Live remaining seconds. BuffSystem only emits ACTIVE_BUFFS_CHANGED on
// add/expire, so `remainingTime` is a snapshot — interpolate from
// activeBuffsSnapshotTime to give the player a smoothly-draining countdown.
function liveRemaining(remainingAtSnap: number): number {
  return Math.max(0, remainingAtSnap - (g.timeTotal - g.activeBuffsSnapshotTime))
}

function categoryCount(c: Category): number {
  if (c === 'all') return PURCHASABLE_BUFFS.length
  return PURCHASABLE_BUFFS.filter((b) => b.category === c).length
}

const items = computed(() =>
  PURCHASABLE_BUFFS
    .filter((b) => activeCategory.value === 'all' || b.category === activeCategory.value)
    .map((b) => {
      const entry = activeByEffectId.value.get(b.effectId)
      const remaining = entry ? liveRemaining(entry.remainingTime) : null
      return {
        ...b,
        affordable: g.gold >= b.cost,
        alreadyActive: remaining !== null,
        remaining,
        progressPct: remaining !== null && b.duration > 0
          ? Math.min(100, (remaining / b.duration) * 100)
          : 0,
      }
    }),
)

// Discoverability dot on the collapsed icon. Two triggers:
//   - any buff is affordable AND not currently active (worth opening), or
//   - any active buff is about to expire (worth re-buying).
// Iterates PURCHASABLE_BUFFS directly so it stays cheap (9 items) and avoids
// resolving the full `items` computed when the panel is hidden.
const expiringSoonSeconds = 5
const hasNotice = computed(() => {
  for (const b of PURCHASABLE_BUFFS) {
    if (g.gold >= b.cost && !activeByEffectId.value.has(b.effectId)) return true
  }
  for (const ab of g.activeBuffs) {
    if (liveRemaining(ab.remainingTime) <= expiringSoonSeconds) return true
  }
  return false
})

function purchase(itemId: string, cost: number): void {
  const engine = g.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.SHOP_PURCHASE, { itemId, cost })
}
</script>

<template>
  <div class="shop-panel" :class="{ collapsed }">
    <button
      v-if="collapsed"
      class="shop-icon-btn"
      type="button"
      aria-label="Open shop"
      aria-expanded="false"
      @click="collapsed = false"
    >
      <span aria-hidden="true">🏪</span>
      <span v-if="hasNotice" class="notice-dot" aria-hidden="true"></span>
    </button>
    <template v-else>
      <h3 class="shop-title">
        <span>Shop</span>
        <button
          class="collapse-icon"
          type="button"
          aria-label="Close shop"
          aria-expanded="true"
          @click="collapsed = true"
        >
          ✕
        </button>
      </h3>
      <div class="category-chips" role="tablist" aria-label="Filter shop by category">
        <button
          v-for="c in CATEGORY_ORDER"
          :key="c"
          type="button"
          role="tab"
          :class="['chip', { 'chip--active': activeCategory === c }]"
          :aria-selected="activeCategory === c"
          :aria-label="`Show ${CATEGORY_LABELS[c]} (${categoryCount(c)})`"
          @click="setCategory(c)"
        >
          {{ CATEGORY_LABELS[c] }}
          <span class="chip-count">{{ categoryCount(c) }}</span>
        </button>
      </div>
      <div class="shop-grid">
        <button
          v-for="item in items"
          :key="item.id"
          class="shop-item"
          :class="{
            unaffordable: !item.affordable,
            active: item.alreadyActive,
          }"
          :disabled="!item.affordable || item.alreadyActive"
          :title="item.description"
          @click="purchase(item.id, item.cost)"
        >
          <span class="item-name">{{ item.name }}</span>
          <span v-if="item.alreadyActive" class="item-timer">
            {{ Math.ceil(item.remaining ?? 0) }}s
          </span>
          <span v-else class="item-cost">{{ item.cost }}g</span>
          <span class="item-desc">{{ item.description }}</span>
          <span
            v-if="item.alreadyActive && item.duration > 0"
            class="item-progress"
            :style="{ width: item.progressPct + '%' }"
            aria-hidden="true"
          ></span>
        </button>
        <p v-if="items.length === 0" class="empty-msg">
          Nothing in this category.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.shop-panel {
  position: absolute;
  left: 8px;
  top: 100px;
  width: 200px;
  background: rgba(26, 21, 32, 0.95);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 8px;
  z-index: var(--z-chrome);
  max-height: 500px;
  overflow-y: auto;
  transition:
    width 200ms ease-out,
    padding 200ms ease-out,
    background 200ms ease-out;
}

.shop-panel.collapsed {
  width: auto;
  padding: 4px;
  background: rgba(26, 21, 32, 0.9);
}

.shop-icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: rgba(255, 215, 0, 0.1);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 120ms,
    border-color 120ms;
}

.shop-icon-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  border-color: var(--gold);
}

.notice-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gold-bright);
  box-shadow: 0 0 4px var(--gold-bright);
  animation: notice-pulse 1.4s ease-in-out infinite;
}

@keyframes notice-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(1.25); }
}

.shop-title {
  font-size: 12px;
  color: var(--gold);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.collapse-icon {
  padding: 0 4px;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  color: var(--axis);
  cursor: pointer;
}

.collapse-icon:hover {
  color: var(--gold);
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.chip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--grid-line);
  border-radius: 12px;
  padding: 3px 8px;
  font-size: 10px;
  color: #c8b894;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}
.chip:hover {
  border-color: var(--gold);
  color: #e8dcc8;
}
.chip:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 1px;
}
.chip--active {
  border-color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.15);
  color: var(--gold-bright);
}
.chip-count {
  font-size: 9px;
  color: var(--axis);
  background: rgba(0, 0, 0, 0.3);
  padding: 0 4px;
  border-radius: 8px;
  font-weight: bold;
}
.chip--active .chip-count {
  color: var(--gold-bright);
  background: rgba(0, 0, 0, 0.4);
}

.shop-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shop-item {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 6px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: #e8dcc8;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: left;
  overflow: hidden;
  transition: background 120ms;
}

.shop-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.shop-item.unaffordable {
  opacity: 0.4;
  cursor: not-allowed;
}

.shop-item.active {
  border-color: var(--gold);
  opacity: 0.85;
}

.item-name {
  font-weight: bold;
  flex: 1;
}

.item-cost {
  color: var(--gold-bright);
  font-weight: bold;
}

.item-timer {
  color: var(--gold-bright);
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.item-desc {
  flex-basis: 100%;
  color: var(--axis);
  font-size: 10px;
}

/* Progress bar overlays the bottom of an active item, shrinking as the buff
   drains. Reflows-free: position: absolute over a relative parent, and width
   is the only animated property. */
.item-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--gold-bright);
  transition: width 200ms linear;
  pointer-events: none;
}

.empty-msg {
  font-size: 11px;
  color: var(--axis);
  margin: 0;
  padding: 4px 0;
  font-style: italic;
}
</style>
