<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { PURCHASABLE_BUFFS } from '@/data/buff-defs'
import type { ActiveBuffEntry } from '@/engine/GameState'

const g = useGameStore()

const buffDefsByEffect = new Map(PURCHASABLE_BUFFS.map((b) => [b.effectId, b]))

function liveRemaining(buff: ActiveBuffEntry): number {
  return Math.max(0, buff.remainingTime - (g.timeTotal - g.activeBuffsSnapshotTime))
}

function shortName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const effects = computed(() =>
  g.activeBuffs
    .map((buff) => {
      const def = buffDefsByEffect.get(buff.effectId)
      const remaining = liveRemaining(buff)
      const total = buff.totalDuration > 0 ? buff.totalDuration : Math.max(remaining, 1)
      const kind = def?.target === 'allEnemies' ? 'debuff' : 'buff'
      return {
        id: buff.id,
        kind,
        name: buff.name,
        label: shortName(buff.name),
        remaining,
        seconds: Math.ceil(remaining),
        progressPct: Math.max(0, Math.min(100, (remaining / total) * 100)),
      }
    })
    .filter((effect) => effect.remaining > 0),
)
</script>

<template>
  <div v-if="effects.length > 0" class="buff-status-stack" aria-label="Active buffs and enemy debuffs">
    <div
      v-for="effect in effects"
      :key="effect.id"
      class="effect-chip"
      :class="`effect-chip--${effect.kind}`"
      :title="`${effect.name}: ${effect.seconds}s`"
    >
      <span class="effect-label">{{ effect.label }}</span>
      <span class="effect-time">{{ effect.seconds }}s</span>
      <span class="effect-bar" :style="{ width: `${effect.progressPct}%` }" aria-hidden="true"></span>
    </div>
  </div>
</template>

<style scoped>
.buff-status-stack {
  width: 148px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--overlay-panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-family: var(--font-mono);
}

.effect-chip {
  position: relative;
  min-height: 28px;
  display: grid;
  grid-template-columns: 38px 1fr;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: var(--overlay-cell-bg);
  color: var(--overlay-text);
  font-size: var(--text-xs);
}

.effect-chip--buff {
  border-color: rgba(255, 215, 0, 0.55);
}

.effect-chip--debuff {
  border-color: rgba(255, 96, 48, 0.65);
}

.effect-label,
.effect-time {
  position: relative;
  z-index: 1;
}

.effect-label {
  font-weight: 800;
  color: var(--gold-bright);
  letter-spacing: 0.5px;
}

.effect-chip--debuff .effect-label {
  color: var(--hp-red);
}

.effect-time {
  justify-self: end;
  font-variant-numeric: tabular-nums;
}

.effect-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--gold-bright);
  transition: width 200ms linear;
  pointer-events: none;
}

.effect-chip--debuff .effect-bar {
  background: var(--hp-red);
}
</style>
