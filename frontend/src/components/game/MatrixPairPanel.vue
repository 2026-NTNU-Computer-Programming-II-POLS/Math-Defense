<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TowerType, Events, GamePhase } from '@/data/constants'
import type { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  void gameStore.towerUpgradeTick
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const pair = computed(() => {
  const t = tower.value
  if (!t?.matrixPairId) return null
  const engine = gameStore.getEngine()
  return engine?.towers.find((o) => o.id === t.matrixPairId) ?? null
})

const dotProduct = computed(() => {
  const t = tower.value
  const p = pair.value
  if (!t || !p) return null
  return t.x * p.x + t.y * p.y
})

const availablePairs = computed(() => {
  const t = tower.value
  if (!t) return []
  const engine = gameStore.getEngine()
  if (!engine) return []
  return engine.towers.filter(
    (o) => o.id !== t.id && o.type === TowerType.MATRIX && !o.matrixPairId,
  )
})

// ── Live laser ramp readout ────────────────────────────────────────────────
// MatrixTowerSystem holds laser state internally and updates it every tick.
// We poll via RAF while the panel is mounted instead of pushing the state
// through Pinia — the data is purely visual and changes 60×/sec, so a store
// mirror would be wasteful.
interface LaserView {
  active: boolean
  invalid: boolean
  rampMultiplier: number
  rampRate: number
  targetCount: number
}

const laserView = ref<LaserView>({
  active: false, invalid: false, rampMultiplier: 1, rampRate: 0.5, targetCount: 0,
})

let _raf: number | null = null
function pollLaser() {
  const engine = gameStore.getEngine()
  const t = tower.value
  const inWave = engine?.state.phase === GamePhase.WAVE
  if (engine && t && t.matrixPairId && inWave) {
    const sys = engine.getSystem('matrixTower') as MatrixTowerSystem | undefined
    const state = sys?.getLaserState(t.id)
    if (state) {
      const mods = t.talentMods ?? {}
      const upgradeRamp = t.upgradeExtras?.['rampRate'] ?? 0
      const rampRate = 0.5 * (1 + (mods['damage_ramp'] ?? 0) + upgradeRamp)
      laserView.value = {
        active: state.targetIds.length > 0 && !state.invalid,
        invalid: state.invalid,
        rampMultiplier: 1 + state.rampTime * rampRate,
        rampRate,
        targetCount: state.targetIds.length,
      }
    } else {
      laserView.value = { active: false, invalid: false, rampMultiplier: 1, rampRate: 0.5, targetCount: 0 }
    }
  } else {
    laserView.value = { active: false, invalid: false, rampMultiplier: 1, rampRate: 0.5, targetCount: 0 }
  }
  _raf = requestAnimationFrame(pollLaser)
}

onMounted(() => { _raf = requestAnimationFrame(pollLaser) })
onBeforeUnmount(() => { if (_raf !== null) cancelAnimationFrame(_raf) })

// Cap the visual progress bar at a sensible "fully ramped" point so the user
// gets a clear "full power" indicator. Beyond ~5× the marginal benefit is
// overshadowed by enemy spawn churn, so 5× is the visual ceiling.
const RAMP_VISUAL_CAP = 5
const rampPct = computed(() => {
  const m = laserView.value.rampMultiplier
  return Math.max(0, Math.min(1, (m - 1) / (RAMP_VISUAL_CAP - 1))) * 100
})

const damagePerSec = computed(() => {
  const dp = dotProduct.value
  if (dp == null) return 0
  const baseDamage = 1 + dp
  if (baseDamage <= 0) return 0
  return baseDamage * laserView.value.rampMultiplier
})

function pairWith(pairId: string) {
  const engine = gameStore.getEngine()
  if (!engine) return
  const t = tower.value
  if (t?.matrixPairId) {
    const old = engine.towers.find((o) => o.id === t.matrixPairId)
    if (old) old.matrixPairId = null
  }
  engine.eventBus.emit(Events.MATRIX_PAIR_CHANGED, { towerId: props.towerId, pairId })
  if (t) t.configured = true
}
</script>

<template>
  <div class="matrix-panel">
    <div v-if="pair" class="pair-info">
      <p class="info-line">Paired with tower at ({{ pair.x }}, {{ pair.y }})</p>
      <p class="info-line">
        Dot product: [{{ tower?.x }}, {{ tower?.y }}] · [{{ pair.x }}, {{ pair.y }}] =
        <strong>{{ dotProduct }}</strong>
      </p>
      <p v-if="dotProduct !== null" class="info-line">
        Base damage: 1 + {{ dotProduct }} = <strong>{{ 1 + dotProduct }}</strong>
      </p>

      <div v-if="dotProduct !== null && (1 + dotProduct) <= 0" class="laser-status laser-status--invalid">
        ⚠ Dot product too negative — laser disabled (base 1 + dot product ≤ 0).
        Reposition towers into the same quadrant.
      </div>

      <template v-else>
        <div class="ramp-block">
          <div class="ramp-header">
            <span class="ramp-label">
              Laser Ramp
              <span v-if="laserView.invalid" class="ramp-state ramp-state--invalid">disabled</span>
              <span v-else-if="laserView.active" class="ramp-state ramp-state--active">
                locked × {{ laserView.targetCount }}
              </span>
              <span v-else class="ramp-state ramp-state--idle">idle</span>
            </span>
            <span class="ramp-mult">×{{ laserView.rampMultiplier.toFixed(2) }}</span>
          </div>
          <div class="ramp-bar" :class="{ 'ramp-bar--idle': !laserView.active }">
            <div
              class="ramp-fill"
              :class="{ 'ramp-fill--active': laserView.active }"
              :style="{ width: `${rampPct}%` }"
            ></div>
            <span class="ramp-cap-label">×1</span>
            <span class="ramp-cap-label ramp-cap-label--right">×5+</span>
          </div>
          <p class="ramp-detail">
            <!-- Per-target: each locked enemy receives this damage independently,
                 so total damage scales with target count (multi-target upgrades). -->
            DPS / target: <strong>{{ damagePerSec.toFixed(1) }}</strong>
            <span class="ramp-rate">· ramp +{{ (laserView.rampRate * 100).toFixed(0) }}% / s</span>
          </p>
        </div>
      </template>
    </div>
    <div v-else class="no-pair">
      <div class="pairing-required-banner" role="status">
        <span class="pairing-required-label">Pairing Required</span>
        <span class="pairing-required-detail">This Matrix tower does not fire until paired.</span>
      </div>
      <p class="info-line">Place another Matrix tower to auto-pair</p>
      <div v-if="availablePairs.length > 0">
        <p class="section-label">Or pair manually:</p>
        <button
          v-for="t in availablePairs"
          :key="t.id"
          class="btn"
          @click="pairWith(t.id)"
        >Pair with ({{ t.x }}, {{ t.y }})</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.matrix-panel { display: flex; flex-direction: column; gap: 6px; }
.info-line { font-size: var(--text-xs); color: var(--charcoal); margin: 0; }
.info-line strong { color: var(--terracotta-deep); }
.section-label { font-size: var(--text-2xs); color: var(--charcoal-soft); margin: 4px 0 2px; }
.no-pair .btn { font-size: var(--text-xs); margin-top: 4px; }

.pairing-required-banner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(204, 153, 51, 0.12);
  border: 1px solid rgba(204, 153, 51, 0.45);
  margin-bottom: 4px;
}
.pairing-required-label {
  font-size: var(--text-2xs);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--gold-bright);
  font-weight: bold;
}
.pairing-required-detail {
  font-size: var(--text-2xs);
  color: var(--text-primary);
  line-height: 1.35;
}

.laser-status {
  font-size: var(--text-2xs);
  padding: 6px 8px;
  border-radius: 6px;
  margin-top: 4px;
  line-height: 1.4;
}
.laser-status--invalid {
  background: rgba(185, 134, 116, 0.14);
  border: 1px solid rgba(185, 134, 116, 0.4);
  color: var(--clay-deep);
}

.ramp-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding: 8px;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.ramp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-2xs);
}

.ramp-label {
  color: var(--charcoal-soft);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ramp-state {
  font-size: var(--text-2xs);
  padding: 1px 5px;
  border-radius: 8px;
  text-transform: none;
  letter-spacing: 0;
}
.ramp-state--idle    { color: var(--charcoal-soft); background: rgba(79, 74, 72, 0.06); }
.ramp-state--active  { color: var(--sage-deep); background: rgba(126, 144, 119, 0.15); }
.ramp-state--invalid { color: var(--clay-deep); background: rgba(185, 134, 116, 0.15); }

.ramp-mult {
  color: var(--terracotta-deep);
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: bold;
}

.ramp-bar {
  position: relative;
  height: 8px;
  background: rgba(79, 74, 72, 0.08);
  border: 1px solid var(--line);
  border-radius: 4px;
  overflow: hidden;
}

.ramp-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--plum), var(--plum-deep));
  transition: width 0.1s linear;
  opacity: 0.5;
}
.ramp-fill--active {
  opacity: 1;
  background: linear-gradient(90deg, var(--plum), var(--gold));
  box-shadow: 0 0 6px rgba(173, 162, 132, 0.4);
}

.ramp-cap-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--text-2xs);
  color: var(--muted);
  pointer-events: none;
  font-family: var(--font-mono);
  padding: 0 3px;
}
.ramp-cap-label:not(.ramp-cap-label--right) { left: 2px; }
.ramp-cap-label--right { right: 2px; }

.ramp-detail {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  margin: 0;
}
.ramp-detail strong { color: var(--terracotta-deep); }
.ramp-rate { color: var(--muted); margin-left: 6px; }
</style>
