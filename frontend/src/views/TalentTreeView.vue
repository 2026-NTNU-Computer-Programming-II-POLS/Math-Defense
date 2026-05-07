<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { talentService, type TalentTreeOut, type TalentNodeOut } from '@/services/talentService'
import { recommendationService } from '@/services/recommendationService'
import { TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { useTalentStore } from '@/stores/talentStore'

const router = useRouter()
const talentStore = useTalentStore()
const tree = ref<TalentTreeOut | null>(null)
const loading = ref(true)
const loadError = ref('')
const allocError = ref('')
const allocatingNodeId = ref<string | null>(null)
const allocating = computed(() => allocatingNodeId.value !== null)
// Pedagogical_Backlog_Spec §28: highlight the talent root tied to the
// player's lowest competency. Same dismiss key as LevelSelectView so the
// two surfaces share one autonomy preference.
const recommendedNodeId = ref<string | null>(null)
const recommendedCompetency = ref<string | null>(null)
const RECOMMENDATION_DISMISS_KEY = 'recommendation:dismissed'
const recommendationDismissed = ref<boolean>(
  typeof localStorage !== 'undefined'
    && localStorage.getItem(RECOMMENDATION_DISMISS_KEY) === '1',
)
const showRecommendation = computed(
  () => recommendedNodeId.value !== null && !recommendationDismissed.value,
)
function dismissRecommendation() {
  recommendationDismissed.value = true
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(RECOMMENDATION_DISMISS_KEY, '1')
  }
}

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
  allocError.value = ''
  allocatingNodeId.value = nodeId
  try {
    tree.value = await talentService.allocate(nodeId)
    await talentStore.load()
  } catch (e: any) {
    allocError.value = e?.detail ?? 'Allocation failed'
  } finally {
    allocatingNodeId.value = null
  }
}

async function resetTree(): Promise<void> {
  if (allocating.value) return
  if (!confirm('Reset all talent points? All allocations will be refunded.')) return
  allocError.value = ''
  allocatingNodeId.value = '__reset__'
  try {
    tree.value = await talentService.reset()
    await talentStore.load()
  } catch (e: any) {
    allocError.value = e?.detail ?? 'Reset failed'
  } finally {
    allocatingNodeId.value = null
  }
}

onMounted(async () => {
  try {
    tree.value = await talentService.getTree()
  } catch {
    loadError.value = 'Failed to load talent tree'
  } finally {
    loading.value = false
  }
  // Recommendation is best-effort; the talent tree must render with no
  // highlight if the call fails.
  try {
    const rec = await recommendationService.me()
    recommendedNodeId.value = rec.talent_node_id
    recommendedCompetency.value = rec.lowest_competency
  } catch {
    recommendedNodeId.value = null
    recommendedCompetency.value = null
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
    <div v-else-if="loadError" class="talent-error">{{ loadError }}</div>
    <template v-else>
      <div v-if="allocError" class="talent-alloc-error">{{ allocError }}</div>
      <div
        v-if="showRecommendation"
        class="talent-recommendation"
        role="status"
        aria-live="polite"
      >
        <span class="rec-text">
          Suggested focus:
          <strong>{{ recommendedCompetency }}</strong>
          — try the highlighted node first.
        </span>
        <button
          type="button"
          class="rec-dismiss"
          aria-label="Dismiss suggestion"
          @click="dismissRecommendation"
        >×</button>
      </div>
      <div class="talent-towers">
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
              loading: allocatingNodeId === node.id,
              recommended: showRecommendation && recommendedNodeId === node.id,
            }]"
            @click="canAllocate(node) && allocate(node.id)"
          >
            <div class="node-name">{{ node.name }}</div>
            <div class="node-level">
              {{ allocatingNodeId === node.id ? '…' : `${node.current_level} / ${node.max_level}` }}
            </div>
            <div class="node-desc">{{ node.description }}</div>
            <div class="node-effect">+{{ (node.effect_per_level * 100).toFixed(0) }}% per level</div>
            <div class="node-cost">Cost: {{ node.cost_per_level }} TP</div>
          </div>
        </div>
      </div>
    </div>
    </template>
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
  overflow-y: auto;
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
.talent-alloc-error { font-size: 11px; color: var(--enemy-red); text-align: center; }

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
.talent-node.loading { opacity: 0.6; cursor: wait; }

.talent-node.recommended {
  /* Override .locked dimming so the highlighted root remains visible even
     when the user has no points to spend. */
  opacity: 1;
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold), 0 0 12px rgba(212, 168, 64, 0.45);
}

.talent-recommendation {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(212, 168, 64, 0.12);
  border: 1px solid var(--gold);
  color: var(--gold);
  border-radius: 4px;
  padding: 0.5rem 0.8rem;
  font-size: 12px;
}

.rec-text strong { color: var(--gold); letter-spacing: 1px; }

.rec-dismiss {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.25rem;
}

.rec-dismiss:hover { opacity: 0.7; }

.node-name { font-size: 11px; color: #e8dcc8; margin-bottom: 4px; }
.node-level { font-size: 13px; color: var(--gold); margin-bottom: 4px; }
.node-desc { font-size: 9px; color: var(--axis); margin-bottom: 4px; }
.node-effect { font-size: 9px; color: var(--gold); opacity: 0.8; }
.node-cost { font-size: 9px; color: var(--axis); opacity: 0.7; margin-top: 2px; }
</style>
