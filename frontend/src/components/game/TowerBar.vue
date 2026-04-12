<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import type { TowerType } from '@/data/constants'

const gameStore = useGameStore()
const uiStore = useUiStore()

const availableTowers = computed(() =>
  Object.values(TOWER_DEFS).filter((def) => def.unlockLevel <= gameStore.level),
)

function selectTower(type: TowerType): void {
  const newType = uiStore.selectedTowerType === type ? null : type
  uiStore.selectTower(newType)
  // TowerPlacementSystem 透過注入的 getSelectedTowerType() 直接從 uiStore 讀取，不需手動同步
}

function canAfford(cost: number): boolean {
  return gameStore.gold >= cost
}
</script>

<template>
  <div class="tower-bar">
    <div class="bar-label">魔法塔</div>
    <div class="tower-list">
      <button
        v-for="def in availableTowers"
        :key="def.type"
        :class="[
          'tower-btn',
          { selected: uiStore.selectedTowerType === def.type },
          { unaffordable: !canAfford(def.cost) },
        ]"
        :title="`${def.description}\n${def.mathConcept}\n費用：${def.cost} 金`"
        @click="selectTower(def.type)"
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
  z-index: 20;
}

.bar-label {
  font-size: 9px; color: var(--axis);
  letter-spacing: 2px; text-transform: uppercase; white-space: nowrap;
}

.tower-list { display: flex; gap: 8px; flex-wrap: wrap; }

.tower-btn {
  display: flex; flex-direction: column; align-items: center;
  gap: 3px; padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--grid-line);
  cursor: pointer; min-width: 90px;
  transition: border-color 0.15s, background 0.15s;
}

.tower-btn:hover:not(.unaffordable) {
  border-color: var(--gold);
  background: rgba(212,168,64,0.08);
}

.tower-btn.selected {
  border-color: var(--gold-bright);
  background: rgba(255,215,0,0.12);
}

.tower-btn.unaffordable { opacity: 0.4; cursor: not-allowed; }

.tower-icon { font-size: 18px; }
.tower-name { font-size: 9px; color: #e8dcc8; letter-spacing: 1px; }
.tower-cost { font-size: 10px; color: var(--gold); }
.cost-red   { color: var(--hp-red); }
</style>
