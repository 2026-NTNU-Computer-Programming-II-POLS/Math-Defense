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

// HEAL effects no-op at full HP because changeHp clamps to maxHp. The shop
// guards on these effectIds so the player can't waste gold (mirrored by the
// purchase-time guard in BuffSystem._purchaseBuff for Bug #3 defence-in-depth).
const HEAL_EFFECT_IDS = new Set(['HEAL_3', 'HEAL_5', 'HEAL_10', 'HEAL_FULL'])
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

function categoryCount(c: Category): number {
  if (c === 'all') return PURCHASABLE_BUFFS.length
  return PURCHASABLE_BUFFS.filter((b) => b.category === c).length
}

const items = computed(() =>
  PURCHASABLE_BUFFS
    .filter((b) => activeCategory.value === 'all' || b.category === activeCategory.value)
    .map((b) => {
      const entry = activeByEffectId.value.get(b.effectId)
      // `remainingTime` is the engine's live value (BuffSystem ticks it during
      // WAVE; gameStore mirrors the array every Nth frame), so read it directly.
      const remaining = entry ? entry.remainingTime : null
      const wastedHeal = HEAL_EFFECT_IDS.has(b.effectId) && g.hp >= g.maxHp
      return {
        ...b,
        affordable: g.gold >= b.cost,
        alreadyActive: remaining !== null,
        wastedHeal,
        remaining,
        progressPct: remaining !== null && b.duration > 0
          ? Math.min(100, (remaining / b.duration) * 100)
          : 0,
      }
    }),
)

// Discoverability dot on the collapsed icon: any buff is affordable AND not
// currently active (worth opening the shop for). BUG-002: a second "active buff
// about to expire" trigger was removed — it advertised a re-buy that the shop's
// `alreadyActive` guard simultaneously disabled (a buff stays alreadyActive for
// its entire lifetime, including the final seconds), so the dot pinged the
// player to act on a button that could never be clicked. The two pieces of
// logic encoded opposite policies on the same window. Iterates PURCHASABLE_BUFFS
// directly so it stays cheap (9 items) and avoids resolving the full `items`
// computed when the panel is hidden.
const hasNotice = computed(() => {
  for (const b of PURCHASABLE_BUFFS) {
    if (g.gold < b.cost) continue
    if (activeByEffectId.value.has(b.effectId)) continue
    // A full-HP heal is affordable but wasted — don't ping the player to open
    // the shop for it (Bug #3).
    if (HEAL_EFFECT_IDS.has(b.effectId) && g.hp >= g.maxHp) continue
    return true
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
      <span class="shop-ico" aria-hidden="true">⌂</span>
      <span class="shop-trigger-text">
        <span class="shop-trigger-title">Shop</span>
        <span class="shop-trigger-sub">Buffs</span>
      </span>
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
            'wasted-heal': item.wastedHeal,
          }"
          :disabled="!item.affordable || item.alreadyActive || item.wastedHeal"
          :title="item.wastedHeal ? 'Already at full HP' : item.description"
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
/* Shop — anchored dropdown popover (mockup .shop-dd). Open/close logic
   (collapsed state) is unchanged; this is the Morandi surface only. */
.shop-panel {
  position: relative;
  width: 440px;
  background: var(--cream-soft);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 12px 14px;
  z-index: var(--z-floating);
  transition:
    width 200ms ease-out,
    padding 200ms ease-out,
    background 200ms ease-out;
}

/* Triangular arrow pointing back at the Shop tool button in the left bar. */
.shop-panel:not(.collapsed)::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 24px;
  width: 0;
  height: 0;
  border: 7px solid transparent;
  border-right-color: var(--cream-soft);
}

.shop-panel.collapsed {
  width: auto;
  /* No padding so the Shop trigger fills the rail at the same width as the
     active-buff cards below it. */
  padding: 0;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

/* Collapsed Shop trigger — wide card (mockup): house icon chip + Shop label. */
.shop-icon-btn {
  position: relative;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
  box-shadow: var(--shadow-sm);
  transition:
    background 120ms,
    border-color 120ms;
}

.shop-icon-btn:hover {
  background: #fff;
  border-color: var(--terracotta);
}

.shop-ico {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--cream);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  color: var(--charcoal-soft);
}
.shop-trigger-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}
.shop-trigger-title {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--charcoal);
}
.shop-trigger-sub {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  color: var(--charcoal-soft);
}

.notice-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gold-deep);
  box-shadow: 0 0 4px var(--gold);
  animation: notice-pulse 1.4s ease-in-out infinite;
}

@keyframes notice-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(1.25); }
}

.shop-title {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--charcoal);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 0 0 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.collapse-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: rgba(245, 250, 254, 0.7);
  font: inherit;
  font-size: var(--text-xs);
  line-height: 1;
  color: var(--charcoal-soft);
  cursor: pointer;
}

.collapse-icon:hover {
  background: var(--clay);
  color: #fff;
  border-color: var(--clay-deep);
}

.category-chips {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-bottom: 10px;
}
.chip {
  background: rgba(245, 250, 254, 0.7);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.3px;
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
}
.chip-count {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  background: rgba(79, 74, 72, 0.08);
  padding: 0 5px;
  border-radius: 8px;
  font-weight: 700;
}
.chip--active .chip-count {
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.shop-item {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(245, 250, 254, 0.86);
  color: var(--charcoal);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: left;
  overflow: hidden;
  transition: background 120ms, border-color 120ms;
}

.shop-item:hover:not(:disabled) {
  background: #fff;
  border-color: var(--gold);
}

.shop-item.unaffordable {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Heal items at full HP — grayed but distinct from "can't afford" so the
   player can tell why the button is disabled (Bug #3 UI hint). */
.shop-item.wasted-heal {
  opacity: 0.5;
  cursor: not-allowed;
}

.shop-item.active {
  border-color: var(--sage-deep);
  opacity: 0.85;
}

.item-name {
  font-weight: 700;
  flex: 1;
}

.item-cost {
  color: var(--gold-deep);
  font-weight: 700;
}

.item-timer {
  color: var(--sage-deep);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.item-desc {
  flex-basis: 100%;
  color: var(--charcoal-soft);
  font-size: var(--text-xs);
}

/* Progress bar overlays the bottom of an active item, shrinking as the buff
   drains. Reflows-free: position: absolute over a relative parent, and width
   is the only animated property. */
.item-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--sage-deep);
  transition: width 200ms linear;
  pointer-events: none;
}

.empty-msg {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  margin: 0;
  padding: 4px 0;
  font-style: italic;
}
</style>
