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

interface NodeLayout {
  node: TalentNodeOut
  tier: number
  // -1 means "span all columns" (centered). Otherwise 1-indexed grid column.
  col: number
  hasChildren: boolean
  hasMultiChildren: boolean
  prereqMet: boolean
}

interface TowerLayout {
  tower: string
  maxCols: number
  flat: NodeLayout[]
}

function nodePrereqMet(node: TalentNodeOut, all: TalentNodeOut[]): boolean {
  for (const pid of node.prerequisites) {
    const p = all.find(n => n.id === pid)
    if (!p || p.current_level < 1) return false
  }
  for (const pid of node.prerequisite_max_levels ?? []) {
    const p = all.find(n => n.id === pid)
    if (!p || p.current_level < p.max_level) return false
  }
  return true
}

// Per-tower BFS layout: tier from longest prereq chain, column from parent
// position (single child inherits parent col, siblings fan to cols 1..N).
// Keeps each T2 visually under the parent it gates on.
const towerLayouts = computed<Record<string, TowerLayout>>(() => {
  if (!tree.value) return {}
  const all = tree.value.nodes
  const tierCache = new Map<string, number>()
  const tierOf = (n: TalentNodeOut): number => {
    const cached = tierCache.get(n.id)
    if (cached !== undefined) return cached
    const prereqs = [...n.prerequisites, ...(n.prerequisite_max_levels ?? [])]
    if (!prereqs.length) { tierCache.set(n.id, 0); return 0 }
    let m = 0
    for (const pid of prereqs) {
      const p = all.find(x => x.id === pid)
      if (p) m = Math.max(m, tierOf(p) + 1)
    }
    tierCache.set(n.id, m)
    return m
  }

  const childCount = new Map<string, number>()
  for (const n of all) {
    for (const pid of [...n.prerequisites, ...(n.prerequisite_max_levels ?? [])]) {
      childCount.set(pid, (childCount.get(pid) ?? 0) + 1)
    }
  }

  const result: Record<string, TowerLayout> = {}
  for (const tw of TOWER_ORDER) {
    const towerNodes = all.filter(n => n.tower_type === tw)
    if (!towerNodes.length) continue
    const byTier = new Map<number, TalentNodeOut[]>()
    let maxTier = 0
    for (const n of towerNodes) {
      const t = tierOf(n)
      if (!byTier.has(t)) byTier.set(t, [])
      byTier.get(t)!.push(n)
      if (t > maxTier) maxTier = t
    }
    let maxCols = 1
    for (let t = 0; t <= maxTier; t++) {
      maxCols = Math.max(maxCols, byTier.get(t)?.length ?? 0)
    }
    const colOf = new Map<string, number>()
    const tier0 = byTier.get(0) ?? []
    tier0.forEach((n, i) => colOf.set(n.id, tier0.length === 1 ? -1 : i + 1))
    for (let t = 1; t <= maxTier; t++) {
      const rows = byTier.get(t) ?? []
      const byParent = new Map<string, TalentNodeOut[]>()
      for (const n of rows) {
        const pid = [...n.prerequisites, ...(n.prerequisite_max_levels ?? [])][0] ?? '__orphan__'
        if (!byParent.has(pid)) byParent.set(pid, [])
        byParent.get(pid)!.push(n)
      }
      for (const [pid, kids] of byParent) {
        if (kids.length === 1) {
          colOf.set(kids[0].id, colOf.get(pid) ?? -1)
        } else {
          kids.forEach((k, i) => colOf.set(k.id, i + 1))
        }
      }
    }
    const flat: NodeLayout[] = []
    for (let t = 0; t <= maxTier; t++) {
      for (const n of byTier.get(t) ?? []) {
        const c = childCount.get(n.id) ?? 0
        flat.push({
          node: n,
          tier: t,
          col: colOf.get(n.id) ?? -1,
          hasChildren: c > 0,
          hasMultiChildren: c > 1,
          prereqMet: nodePrereqMet(n, all),
        })
      }
    }
    result[tw] = { tower: tw, maxCols, flat }
  }
  return result
})

function cellStyle(l: NodeLayout): Record<string, string> {
  return {
    gridRow: String(l.tier + 1),
    gridColumn: l.col === -1 ? '1 / -1' : String(l.col),
  }
}

// Connector geometry + lighting are driven from data-* on the .node-cell
// wrapper so the bar can span the full grid cell (the .talent-node card is
// max-width clamped and centered inside the cell, which would otherwise
// leave the fan-out endpoints far short of the children below).
function cellAttrs(l: NodeLayout): Record<string, string> {
  return {
    'data-tier': String(l.tier),
    'data-has-children': l.hasChildren ? 'true' : 'false',
    'data-multi-children': l.hasMultiChildren ? 'true' : 'false',
    'data-prereq-met': l.prereqMet ? 'true' : 'false',
    'data-allocated': l.node.current_level >= 1 ? 'true' : 'false',
  }
}

function canAllocate(node: TalentNodeOut): boolean {
  if (!tree.value) return false
  if (node.current_level >= node.max_level) return false
  if (tree.value.points_available < node.cost_per_level) return false
  for (const prereq of node.prerequisites) {
    const prereqNode = tree.value.nodes.find(n => n.id === prereq)
    if (!prereqNode || prereqNode.current_level < 1) return false
  }
  // Phase 7 (Q14): advanced "tier-2" nodes require parent at max level.
  // Mirror backend tree.allocate so locked nodes render dimmed instead of
  // surfacing a 409 only after click.
  for (const prereq of node.prerequisite_max_levels ?? []) {
    const prereqNode = tree.value.nodes.find(n => n.id === prereq)
    if (!prereqNode || prereqNode.current_level < prereqNode.max_level) return false
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
        <button class="btn" @click="router.push({ name: 'menu' })">← Back</button>
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
      <div
        v-for="tw in TOWER_ORDER"
        :key="tw"
        class="tower-section"
        :style="{ '--tower-color': TOWER_DEFS[tw]?.cardColor ?? TOWER_DEFS[tw]?.color }"
      >
        <h3 class="tower-name">{{ TOWER_DEFS[tw]?.nameEn ?? tw }}</h3>
        <div
          class="tower-tree"
          :style="{ '--max-cols': towerLayouts[tw]?.maxCols ?? 1 }"
        >
          <div
            v-for="layout in (towerLayouts[tw]?.flat ?? [])"
            :key="layout.node.id"
            class="node-cell"
            :style="cellStyle(layout)"
            v-bind="cellAttrs(layout)"
          >
            <div
              :class="['talent-node', {
                maxed: layout.node.current_level >= layout.node.max_level,
                allocated: layout.node.current_level >= 1 && layout.node.current_level < layout.node.max_level,
                available: canAllocate(layout.node),
                locked: !layout.prereqMet && layout.node.current_level < 1,
                loading: allocatingNodeId === layout.node.id,
                recommended: showRecommendation && recommendedNodeId === layout.node.id,
                't2-node': (layout.node.prerequisite_max_levels?.length ?? 0) > 0,
              }]"
              @click="canAllocate(layout.node) && allocate(layout.node.id)"
            >
              <div class="node-name">
                {{ layout.node.name }}
                <!-- Phase 7 (Q14): tier-2 badge so advanced nodes are visually
                     distinct from base nodes. Driven from the same field the
                     gate above uses, so badge + gate cannot drift apart. -->
                <span
                  v-if="(layout.node.prerequisite_max_levels?.length ?? 0) > 0"
                  class="tier-badge"
                  aria-label="Tier 2 talent — requires parent at max level"
                >T2</span>
              </div>
              <div class="node-level">
                {{ allocatingNodeId === layout.node.id ? '…' : `${layout.node.current_level} / ${layout.node.max_level}` }}
              </div>
              <div class="node-desc">{{ layout.node.description }}</div>
              <div class="node-effect">+{{ (layout.node.effect_per_level * 100).toFixed(0) }}% per level</div>
              <div class="node-cost">Cost: {{ layout.node.cost_per_level }} TP</div>
            </div>
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
  max-width: 1100px;
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

.talent-title { font-size: var(--text-lg); font-family: var(--font-mono); color: var(--charcoal); letter-spacing: 2px; }
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

.talent-towers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 760px) {
  .talent-towers { grid-template-columns: 1fr; }
}

.tower-section {
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-left: 3px solid var(--tower-color, var(--line-strong));
  border-radius: 12px;
  padding: 16px 16px 20px;
}

.tower-name {
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--tower-color, var(--charcoal-soft));
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 18px;
  text-align: center;
}

/* Per-tower mini-tree grid: rows = tier depth, cols = max sibling width.
   --col-gap is parameterized so the fan-bar endpoint math below can stay
   in lockstep with column-gap. */
.tower-tree {
  --col-gap: 14px;
  --row-gap: 36px;
  --connector-rise: 18px;
  display: grid;
  grid-template-columns: repeat(var(--max-cols, 1), minmax(0, 1fr));
  column-gap: var(--col-gap);
  row-gap: var(--row-gap);
  align-items: start;
  padding: 6px 8px 4px;
}

/* Wrapper that owns grid placement + connector pseudo-elements. Cell spans
   the full grid column(s) so percentage-based fan-bar endpoints map onto
   the child cells' centers, even though the .talent-node card inside is
   max-width clamped and centered. */
.node-cell {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

/* Vertical drop from each non-root cell up to mid-row-gap (meets parent's
   stub or fan-bar drawn from above). */
.node-cell:not([data-tier="0"])::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(-1 * var(--connector-rise));
  width: 2px;
  height: var(--connector-rise);
  transform: translateX(-50%);
  background: var(--line-strong);
  pointer-events: none;
}

/* Single-child parent: a short stub drops from cell bottom to mid-row-gap,
   meeting the child's ::before. Child inherits parent's column so both sit
   on the same vertical line. */
.node-cell[data-has-children="true"]:not([data-multi-children="true"])::after {
  content: '';
  position: absolute;
  bottom: calc(-1 * var(--connector-rise));
  left: 50%;
  width: 2px;
  height: var(--connector-rise);
  transform: translateX(-50%);
  background: var(--line-strong);
  pointer-events: none;
}

/* Multi-children parent (only root in current talent data): horizontal bar
   at mid-row-gap. Endpoints land at each child column's center.
   For a 2-col grid (cell-1 center at (W-gap)/4 from left, cell-2 center
   symmetric), the bar must span left=25%-gap/4, right=25%-gap/4. */
.node-cell[data-multi-children="true"]::after {
  content: '';
  position: absolute;
  bottom: calc(-1 * var(--connector-rise));
  left: calc(25% - var(--col-gap) / 4);
  right: calc(25% - var(--col-gap) / 4);
  height: 2px;
  background: var(--line-strong);
  pointer-events: none;
}

/* Light connectors with the tower color once the path is open. The drop
   lights when this child's prereq is satisfied; the parent's stub/fan-bar
   lights when the parent has any allocation. */
.node-cell[data-prereq-met="true"]:not([data-tier="0"])::before {
  background: var(--tower-color, var(--terracotta));
}
.node-cell[data-has-children="true"][data-allocated="true"]::after {
  background: var(--tower-color, var(--terracotta));
}

.talent-node {
  position: relative;
  width: 100%;
  max-width: 170px;
  padding: 10px 12px;
  background: rgba(245, 250, 254, 0.7);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: default;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.talent-node.available {
  cursor: pointer;
  border-color: var(--tower-color, var(--terracotta));
}

.talent-node.available:hover {
  background: linear-gradient(135deg, rgba(168, 188, 203, 0.26), #fff);
  box-shadow: 0 0 0 1px var(--tower-color, var(--terracotta));
}

.talent-node.allocated {
  border-color: var(--tower-color, var(--terracotta));
  background: rgba(245, 250, 254, 0.92);
}

.talent-node.maxed {
  border-color: var(--tower-color, var(--terracotta));
  background: linear-gradient(135deg, rgba(168, 188, 203, 0.26), #fff);
  box-shadow: inset 0 0 0 1px var(--tower-color, var(--terracotta));
}

.talent-node.locked { opacity: 0.45; }
.talent-node.loading { opacity: 0.6; cursor: wait; }

.talent-node.t2-node {
  border-style: dashed;
}
.talent-node.t2-node.allocated,
.talent-node.t2-node.maxed {
  border-style: solid;
}

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

.node-name {
  font-size: var(--text-sm);
  color: var(--charcoal);
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: space-between;
}

/* Phase 7 (Q14): tier-2 badge placed inline next to .node-name. */
.tier-badge {
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
  color: var(--terracotta-deep);
  border: 1px solid var(--terracotta-deep);
  border-radius: 2px;
  padding: 0 4px;
  letter-spacing: 1px;
}
.node-level { font-size: var(--text-sm); font-family: var(--font-mono); color: var(--terracotta-deep); font-weight: 700; margin-bottom: 4px; }
.node-desc { font-size: var(--text-xs); color: var(--charcoal-soft); margin-bottom: 4px; }
.node-effect { font-size: var(--text-xs); color: var(--terracotta-deep); opacity: 0.9; }
.node-cost { font-size: var(--text-2xs); color: var(--charcoal-soft); opacity: 0.8; margin-top: 2px; }
</style>
