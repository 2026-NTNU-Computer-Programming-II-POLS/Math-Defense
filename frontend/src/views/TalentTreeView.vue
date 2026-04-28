<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { talentService, type TalentTreeOut, type TalentNodeOut } from '@/services/talentService'
import { TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { useTalentStore } from '@/stores/talentStore'

const router = useRouter()
const talentStore = useTalentStore()
const tree = ref<TalentTreeOut | null>(null)
const loading = ref(true)
const error = ref('')
const allocating = ref(false)

const TOWER_ORDER: TowerType[] = [
  TowerType.MAGIC, TowerType.RADAR_A, TowerType.RADAR_B, TowerType.RADAR_C,
  TowerType.MATRIX, TowerType.LIMIT, TowerType.CALCULUS,
]

const nodesByTower = computed(() => {
  if (!tree.value) return {}
  const map: Record<string, TalentNodeOut[]> = {}
  for (const node of tree.value.nodes) {
    if (!map[node.tower_type]) map[node.tower_type] = []
    map[node.tower_type].push(node)
  }
  return map
})

function canAllocate(node: TalentNodeOut): boolean {
  if (!tree.value) return false
  if (node.current_level >= node.max_level) return false
  if (tree.value.points_available < node.cost_per_level) return false
  for (const prereq of node.prerequisites) {
    const prereqNode = tree.value.nodes.find(n => n.id === prereq)
    if (!prereqNode || prereqNode.current_level < 1) return false
  }
  return true
}

async function allocate(nodeId: string): Promise<void> {
  if (allocating.value) return
  allocating.value = true
  try {
    tree.value = await talentService.allocate(nodeId)
    await talentStore.load()
  } catch (e: any) {
    error.value = e?.detail ?? 'Allocation failed'
  } finally {
    allocating.value = false
  }
}

async function resetTree(): Promise<void> {
  if (allocating.value) return
  allocating.value = true
  try {
    tree.value = await talentService.reset()
    await talentStore.load()
  } catch (e: any) {
    error.value = e?.detail ?? 'Reset failed'
  } finally {
    allocating.value = false
  }
}

onMounted(async () => {
  try {
    tree.value = await talentService.getTree()
  } catch {
    error.value = 'Failed to load talent tree'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="talent-view">
    <header class="talent-header">
      <h1 class="talent-title">Talent Tree</h1>
      <div v-if="tree" class="talent-points">
        <span class="tp-available">{{ tree.points_available }} available</span>
        <span class="tp-detail">( {{ tree.points_earned }} earned / {{ tree.points_spent }} spent )</span>
      </div>
      <div class="talent-actions">
        <button class="btn reset-btn" :disabled="allocating || !tree || tree.points_spent === 0" @click="resetTree">Reset All</button>
        <button class="btn" @click="router.push('/profile')">← Back</button>
      </div>
    </header>

    <div v-if="loading" class="talent-loading">Loading...</div>
    <div v-else-if="error" class="talent-error">{{ error }}</div>
    <div v-else class="talent-towers">
      <div v-for="tw in TOWER_ORDER" :key="tw" class="tower-section">
        <h3 class="tower-name" :style="{ color: TOWER_DEFS[tw]?.color }">
          {{ TOWER_DEFS[tw]?.nameEn ?? tw }}
        </h3>
        <div class="nodes">
          <div
            v-for="node in (nodesByTower[tw] ?? [])"
            :key="node.id"
            :class="['talent-node', {
              maxed: node.current_level >= node.max_level,
              available: canAllocate(node),
              locked: !canAllocate(node) && node.current_level < node.max_level,
            }]"
            @click="canAllocate(node) && allocate(node.id)"
          >
            <div class="node-name">{{ node.name }}</div>
            <div class="node-level">{{ node.current_level }} / {{ node.max_level }}</div>
            <div class="node-desc">{{ node.description }}</div>
            <div class="node-effect">+{{ (node.effect_per_level * 100).toFixed(0) }}% per level</div>
            <div class="node-cost">Cost: {{ node.cost_per_level }} TP</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.talent-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 100vh;
}

.talent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.talent-title { font-size: 20px; color: var(--gold); letter-spacing: 4px; }
.talent-points { font-size: 12px; }
.tp-available { color: var(--gold); font-weight: bold; }
.tp-detail { color: var(--axis); margin-left: 8px; }
.talent-actions { display: flex; gap: 8px; }

.reset-btn { border-color: var(--enemy-red); color: var(--enemy-red); }
.reset-btn:hover:not(:disabled) { background: var(--enemy-red); color: var(--stone-dark); }
.reset-btn:disabled { opacity: 0.3; }

.talent-loading, .talent-error { text-align: center; color: var(--axis); padding: 32px; }
.talent-error { color: var(--enemy-red); }

.talent-towers { display: flex; flex-direction: column; gap: 24px; }

.tower-section {
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  padding: 16px;
}

.tower-name {
  font-size: 14px;
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.nodes { display: flex; gap: 12px; flex-wrap: wrap; }

.talent-node {
  width: 140px;
  padding: 10px;
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  cursor: default;
  transition: border-color 0.2s, background 0.2s;
}

.talent-node.available {
  cursor: pointer;
  border-color: var(--gold);
}

.talent-node.available:hover {
  background: rgba(212, 168, 64, 0.1);
}

.talent-node.maxed {
  border-color: var(--gold);
  background: rgba(212, 168, 64, 0.08);
}

.talent-node.locked { opacity: 0.4; }

.node-name { font-size: 11px; color: #e8dcc8; margin-bottom: 4px; }
.node-level { font-size: 13px; color: var(--gold); margin-bottom: 4px; }
.node-desc { font-size: 9px; color: var(--axis); margin-bottom: 4px; }
.node-effect { font-size: 9px; color: var(--gold); opacity: 0.8; }
.node-cost { font-size: 9px; color: var(--axis); opacity: 0.7; margin-top: 2px; }
</style>
