<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SPELL_DEFS } from '@/data/spell-defs'
import { Events } from '@/data/constants'

const g = useGameStore()
const castingSpell = ref<string | null>(null)
let _unsubClick: (() => void) | null = null
let _lastCastAt = 0

onMounted(() => {
  const engine = g.getEngine()
  if (!engine) {
    if (import.meta.env.DEV) console.warn('[SpellBar] engine not ready at mount — spell click events will not be registered')
    return
  }
  _unsubClick = engine.eventBus.on(Events.CANVAS_CLICK, ({ game: gp }) => {
    if (!castingSpell.value) return
    castAtPosition(gp.x, gp.y)
  })
})

onBeforeUnmount(() => {
  _unsubClick?.()
  _unsubClick = null
})

const spells = computed(() =>
  SPELL_DEFS.map((s) => {
    const cd = g.spellCooldowns[s.id] ?? 0
    return {
      ...s,
      onCooldown: cd > 0,
      cooldownPct: cd > 0 ? (cd / s.cooldown) * 100 : 0,
      cooldownLabel: cd > 0 ? Math.ceil(cd) + 's' : '',
      affordable: g.gold >= s.cost,
    }
  }),
)

function selectSpell(spellId: string): void {
  if (castingSpell.value === spellId) {
    castingSpell.value = null
    return
  }
  castingSpell.value = spellId
}

function castAtPosition(x: number, y: number): void {
  if (!castingSpell.value) return
  const now = Date.now()
  if (now - _lastCastAt < 150) return
  const engine = g.getEngine()
  if (!engine) return
  _lastCastAt = now
  engine.eventBus.emit(Events.SPELL_CAST, {
    spellId: castingSpell.value,
    x, y,
  })
  castingSpell.value = null
}

defineExpose({ castingSpell, castAtPosition })
</script>

<template>
  <div class="spell-bar">
    <button
      v-for="spell in spells"
      :key="spell.id"
      class="spell-btn"
      :class="{
        'on-cooldown': spell.onCooldown,
        unaffordable: !spell.affordable && !spell.onCooldown,
        casting: castingSpell === spell.id,
      }"
      :style="{ '--spell-color': spell.color }"
      :disabled="spell.onCooldown || !spell.affordable"
      :title="`${spell.name} (${spell.cost}g) — ${spell.description}`"
      :aria-label="`${spell.name}, costs ${spell.cost} gold${spell.onCooldown ? `, on cooldown ${spell.cooldownLabel}` : ''}`"
      @click="selectSpell(spell.id)"
    >
      <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <g v-if="spell.id === 'fireball'">
          <path class="icon-glow" d="M20.6 3.4c.4 4.2-2.7 5.5-1 9.2 1.1-1.2 2-2.7 2.3-4.5 3.4 2.5 5.4 5.5 5.4 9.3 0 6.1-4.9 11-11 11s-11-4.9-11-11c0-4.8 3.4-8.2 7.9-12.1-.4 3.4.5 5.5 2.5 6.6.5-3.1 2-5.9 4.9-8.5Z" />
          <path class="icon-fill" d="M16.3 27.2c-4.9 0-8.7-3.8-8.7-8.6 0-3 1.5-5.4 4.2-7.8.1 2.8 1.4 4.7 3.9 5.6.1-2.9.9-5.4 3-7.8.6 2.8-.1 4.9.9 7.1 1.3-.6 2.2-1.7 2.8-3.2 1.6 1.7 2.6 3.5 2.6 6.1 0 4.8-3.8 8.6-8.7 8.6Z" />
          <circle class="icon-accent" cx="16.2" cy="20.2" r="3.9" />
        </g>
        <g v-else-if="spell.id === 'slow'">
          <circle class="icon-glow" cx="16" cy="16" r="10.8" />
          <path class="icon-line" d="M16 5.5v21M8.6 8.6l14.8 14.8M5.5 16h21M8.6 23.4 23.4 8.6" />
          <path class="icon-line thin" d="m12.2 7.7 3.8 3.1 3.8-3.1M12.2 24.3l3.8-3.1 3.8 3.1M7.7 12.2l3.1 3.8-3.1 3.8M24.3 12.2 21.2 16l3.1 3.8" />
          <circle class="icon-accent" cx="16" cy="16" r="2.8" />
        </g>
        <g v-else-if="spell.id === 'lightning'">
          <path class="icon-glow" d="M19.4 2.8 7.7 17.4h7l-2.1 11.8 11.7-15h-7.1l2.2-11.4Z" />
          <path class="icon-fill" d="M18.2 4.8 9.6 16.2h7.1l-2.4 10.9 8.2-11.9h-7.1l2.8-10.4Z" />
          <path class="icon-accent" d="M17.1 8.4 12 15.2h5.1l-1.2 6.2 4.1-6.8h-4.7l1.8-6.2Z" />
        </g>
        <g v-else-if="spell.id === 'heal'">
          <circle class="icon-glow" cx="16" cy="16" r="11.2" />
          <path class="icon-line" d="M16 7.2v17.6M7.2 16h17.6" />
          <path class="icon-fill" d="M11.3 7.4c-2.9 1-5.1 3.6-5.7 7 3.4.2 6.1-1 8-3.6-1.1-.7-1.9-1.8-2.3-3.4ZM20.7 24.6c2.9-1 5.1-3.6 5.7-7-3.4-.2-6.1 1-8 3.6 1.1.7 1.9 1.8 2.3 3.4Z" />
          <circle class="icon-accent" cx="16" cy="16" r="3.2" />
        </g>
      </svg>
      <span v-if="spell.onCooldown" class="cd-overlay" :style="{ height: `${spell.cooldownPct}%` }" />
      <span v-if="spell.onCooldown" class="cd-label">{{ spell.cooldownLabel }}</span>
      <span class="spell-cost">{{ spell.cost }}</span>
    </button>
  </div>
</template>

<style scoped>
.spell-bar {
  display: flex;
  gap: 4px;
}

.spell-btn {
  position: relative;
  width: 44px;
  height: 44px;
  border: 2px solid var(--spell-color, #888);
  border-radius: 6px;
  background: rgba(26, 21, 32, 0.9);
  color: var(--spell-color, #888);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: bold;
  overflow: hidden;
  transition: background 120ms, transform 80ms;
}

.spell-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}

.spell-btn.casting {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 8px var(--spell-color);
}

.spell-btn.on-cooldown {
  opacity: 0.5;
  cursor: not-allowed;
}

.spell-btn.unaffordable {
  opacity: 0.3;
}

.spell-icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 26px;
  height: 26px;
  margin: 7px auto 0;
  color: var(--spell-color, #888);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--spell-color, #888) 48%, transparent));
}

.icon-fill {
  fill: currentColor;
}

.icon-glow {
  fill: currentColor;
  opacity: 0.22;
}

.icon-accent {
  fill: #fff6d6;
  opacity: 0.86;
}

.icon-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-line.thin {
  stroke-width: 1.7;
}

.cd-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  transition: height 200ms linear;
}

.cd-label {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 9px;
  color: #fff;
  z-index: 2;
}

.spell-cost {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: 8px;
  color: var(--gold);
  z-index: 2;
}

@media (prefers-reduced-motion: reduce) {
  .spell-btn {
    transition: none;
  }
  .spell-btn:hover:not(:disabled) {
    transform: none;
  }
}
</style>
