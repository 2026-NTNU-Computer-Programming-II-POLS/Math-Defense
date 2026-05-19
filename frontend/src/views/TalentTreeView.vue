<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { talentService, type TalentTreeOut, type TalentNodeOut } from '@/services/talentService'
import { recommendationService } from '@/services/recommendationService'
import { TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { useTalentStore } from '@/stores/talentStore'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const router = useRouter()
const talentStore = useTalentStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
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
// F-BUG-7: namespace per user — shared lab devices used to leak one
// student's "dismissed" pref onto the next student to log in. Falls back
// to a sentinel namespace pre-login so the unauthenticated path never
// cross-contaminates a real user.
function dismissKey(): string {
  const uid = authStore.user?.id ?? '__anon__'
  return `recommendation:dismissed:${uid}`
}
const recommendationDismissed = ref<boolean>(
  typeof localStorage !== 'undefined'
    && localStorage.getItem(dismissKey()) === '1',
)
const showRecommendation = computed(
  () => recommendedNodeId.value !== null && !recommendationDismissed.value,
)
function dismissRecommendation() {
  recommendationDismissed.value = true
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(dismissKey(), '1')
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
  const ok = await uiStore.showConfirm(
    'Reset talent tree',
    'Reset all talent points? All allocations will be refunded.',
    { confirmLabel: 'Reset' },
  )
  if (!ok) return
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
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin: 40px auto;
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.talent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.talent-title { font-size: 1.35rem; font-family: var(--font-mono); color: var(--charcoal); letter-spacing: 2px; }
.talent-points { font-size: var(--text-xs); }
.tp-available { color: var(--terracotta-deep); font-weight: 700; }
.tp-detail { color: var(--charcoal-soft); margin-left: 8px; }
.talent-actions { display: flex; gap: 8px; }

.reset-btn { border-color: rgba(185, 134, 116, 0.5); color: var(--clay-deep); }
.reset-btn:hover:not(:disabled) { background: var(--clay); color: #fff; }
.reset-btn:disabled { opacity: 0.3; }

.talent-loading, .talent-error { text-align: center; color: var(--charcoal-soft); padding: 32px; }
.talent-error { color: var(--clay-deep); }
.talent-alloc-error { font-size: var(--text-xs); color: var(--clay-deep); text-align: center; }

.talent-towers { display: flex; flex-direction: column; gap: 18px; }

.tower-section {
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
}

.tower-name {
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--charcoal-soft);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.nodes { display: flex; gap: 12px; flex-wrap: wrap; }

.talent-node {
  width: 140px;
  padding: 12px;
  background: rgba(245, 250, 254, 0.7);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: default;
  transition: border-color 0.2s, background 0.2s;
}

.talent-node.available {
  cursor: pointer;
  border-color: var(--terracotta);
}

.talent-node.available:hover {
  background: linear-gradient(135deg, rgba(168, 188, 203, 0.26), #fff);
}

.talent-node.maxed {
  border-color: var(--terracotta);
  background: linear-gradient(135deg, rgba(168, 188, 203, 0.26), #fff);
}

.talent-node.locked { opacity: 0.5; }
.talent-node.loading { opacity: 0.6; cursor: wait; }

.talent-node.recommended {
  /* Override .locked dimming so the highlighted root remains visible even
     when the user has no points to spend. */
  opacity: 1;
  border-color: var(--terracotta);
  box-shadow: 0 0 0 1px var(--terracotta), 0 0 12px rgba(168, 188, 203, 0.5);
}

.talent-recommendation {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(168, 188, 203, 0.2);
  border: 1px solid var(--terracotta);
  color: var(--charcoal-soft);
  border-radius: 10px;
  padding: 0.5rem 0.8rem;
  font-size: var(--text-xs);
}

.rec-text strong { color: var(--terracotta-deep); letter-spacing: 1px; }

.rec-dismiss {
  background: transparent;
  border: none;
  color: inherit;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
  padding: 0 0.25rem;
}

.rec-dismiss:hover { opacity: 0.7; }

.node-name { font-size: var(--text-sm); color: var(--charcoal); font-weight: 600; margin-bottom: 4px; }
.node-level { font-size: var(--text-sm); font-family: var(--font-mono); color: var(--terracotta-deep); font-weight: 700; margin-bottom: 4px; }
.node-desc { font-size: var(--text-xs); color: var(--charcoal-soft); margin-bottom: 4px; }
.node-effect { font-size: var(--text-xs); color: var(--terracotta-deep); opacity: 0.9; }
.node-cost { font-size: var(--text-2xs); color: var(--charcoal-soft); opacity: 0.8; margin-top: 2px; }
</style>
