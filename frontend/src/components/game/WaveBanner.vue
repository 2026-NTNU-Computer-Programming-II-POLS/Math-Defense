<script setup lang="ts">
/**
 * WaveBanner — Visual Redesign Phase 4.
 *
 * Slides in from the top at the BUILD → WAVE transition, names the wave
 * ("WAVE N"), lists the enemy mix as mini glyph icons sourced from
 * ENEMY_DEFS, and auto-hides after `BANNER_DURATION_MS`. Listens to the
 * reactive `gameStore.phase`; no direct event-bus subscription, so no
 * EVENT_HANDLER_REGISTRY entry is required.
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'
import type { EnemyType } from '@/data/constants'
import { ENEMY_DEFS } from '@/data/enemy-defs'

const BANNER_DURATION_MS = 1600

interface BannerSlot {
  type: EnemyType
  count: number
  color: string
  name: string
}

const g = useGameStore()
const visible = ref(false)
const waveNumber = ref(0)
const slots = ref<BannerSlot[]>([])
let hideTimer: ReturnType<typeof setTimeout> | null = null

function collectMix(): BannerSlot[] {
  const engine = g.getEngine()
  const waves = engine?.currentWaves
  // gameStore.wave is 1-indexed for the *current* wave once WAVE phase has
  // begun; the active definition is therefore at index wave - 1.
  const def = waves?.[g.wave - 1]
  if (!def) return []
  // Each EnemySpawnEntry is a single spawn — tally by type for the icon strip.
  const counts = new Map<EnemyType, number>()
  for (const entry of def.enemies) {
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1)
  }
  return [...counts.entries()].map(([type, count]) => {
    const ed = ENEMY_DEFS[type]
    return { type, count, color: ed.color, name: ed.name }
  })
}

watch(() => g.phase, (next, prev) => {
  if (next === GamePhase.WAVE && prev === GamePhase.BUILD) {
    waveNumber.value = g.wave
    slots.value = collectMix()
    visible.value = true
    if (hideTimer !== null) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { visible.value = false; hideTimer = null }, BANNER_DURATION_MS)
  } else if (next !== GamePhase.WAVE && visible.value) {
    visible.value = false
    if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null }
  }
})

onBeforeUnmount(() => {
  if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null }
})
</script>

<template>
  <Transition name="wave-banner">
    <div
      v-if="visible"
      class="wave-banner"
      role="status"
      aria-live="polite"
      :aria-label="`Wave ${waveNumber} starting`"
    >
      <span class="wave-banner-label">WAVE</span>
      <span class="wave-banner-num">{{ waveNumber }}</span>
      <ul v-if="slots.length" class="wave-banner-mix" aria-hidden="true">
        <li
          v-for="s in slots"
          :key="s.type"
          class="mix-slot"
          :style="{ '--slot-color': s.color }"
          :title="`${s.name} ×${s.count}`"
        >
          <span class="mix-dot" />
          <span class="mix-count">×{{ s.count }}</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
.wave-banner {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 44px + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 22px;
  background: var(--overlay-panel-bg);
  border: 2px solid var(--gold);
  border-radius: 4px;
  box-shadow: var(--shadow);
  font-family: var(--font-mono);
  color: var(--overlay-text);
  z-index: var(--z-floating);
  pointer-events: none;
  white-space: nowrap;
}

.wave-banner-label {
  font-size: var(--text-sm);
  letter-spacing: 3px;
  color: var(--gold-deep);
  font-weight: 700;
}

.wave-banner-num {
  font-size: var(--text-2xl);
  font-weight: 900;
  color: var(--gold-deep);
  text-shadow: var(--gold-shadow);
}

.wave-banner-mix {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid var(--gold-dim);
  padding-left: 14px;
}

.mix-slot {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mix-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--slot-color);
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 6px var(--slot-color);
}

.mix-count {
  font-size: var(--text-xs);
  color: var(--overlay-text);
  font-weight: 700;
}

/* Slide + fade in/out. Reduced motion strips the translate. */
.wave-banner-enter-active,
.wave-banner-leave-active {
  transition: transform 220ms ease-out, opacity 220ms ease-out;
}
.wave-banner-enter-from {
  opacity: 0;
  transform: translate(-50%, -24px);
}
.wave-banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}

@media (prefers-reduced-motion: reduce) {
  .wave-banner-enter-active,
  .wave-banner-leave-active { transition: opacity 220ms ease-out; }
  .wave-banner-enter-from { transform: translateX(-50%); opacity: 0; }
  .wave-banner-leave-to { transform: translateX(-50%); opacity: 0; }
}
</style>
