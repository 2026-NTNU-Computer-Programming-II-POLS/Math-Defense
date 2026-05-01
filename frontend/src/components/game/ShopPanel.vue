<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { PURCHASABLE_BUFFS } from '@/data/buff-defs'
import { Events } from '@/data/constants'

const g = useGameStore()
const collapsed = ref(false)

const items = computed(() =>
  PURCHASABLE_BUFFS.map((b) => ({
    ...b,
    affordable: g.gold >= b.cost,
    alreadyActive: g.activeBuffs.some((ab) => ab.effectId === b.effectId),
  })),
)

function purchase(itemId: string, cost: number): void {
  const engine = g.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.SHOP_PURCHASE, { itemId, cost })
}
</script>

<template>
  <div class="shop-panel" :class="{ collapsed }">
    <h3 class="shop-title" @click="collapsed = !collapsed">
      <span>Shop</span>
      <span class="collapse-icon">{{ collapsed ? '▶' : '▼' }}</span>
    </h3>
    <div v-if="!collapsed" class="shop-grid">
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
        <span class="item-cost">{{ item.cost }}g</span>
        <span class="item-desc">{{ item.description }}</span>
      </button>
    </div>
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
  max-height: 400px;
  overflow-y: auto;
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
  cursor: pointer;
  user-select: none;
}
.shop-panel.collapsed .shop-title { margin-bottom: 0; }
.collapse-icon { font-size: 9px; color: var(--axis); }

.shop-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shop-item {
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
  opacity: 0.6;
}

.item-name {
  font-weight: bold;
  flex: 1;
}

.item-cost {
  color: var(--gold-bright);
  font-weight: bold;
}

.item-desc {
  flex-basis: 100%;
  color: var(--axis);
  font-size: 10px;
}
</style>
