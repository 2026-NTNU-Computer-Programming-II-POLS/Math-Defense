<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SPELL_DEFS } from '@/data/spell-defs'
import { Events, GamePhase } from '@/data/constants'
import { useUiAudio } from '@/composables/useUiAudio'
import SpellIcon from './SpellIcon.vue'

const g = useGameStore()
const uiAudio = useUiAudio()
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
  if (g.phase !== GamePhase.WAVE) {
    castingSpell.value = null
    uiAudio.cancel()
    return
  }

  const spell = SPELL_DEFS.find((s) => s.id === spellId)
  if (spell?.targetMode === 'self') {
    castingSpell.value = spellId
    const point = g.selfCastCenter()
    castAtPosition(point.x, point.y)
    return
  }

  if (castingSpell.value === spellId) {
    castingSpell.value = null
    return
  }
  castingSpell.value = spellId
}

function castAtPosition(x: number, y: number): void {
  if (!castingSpell.value) return
  if (g.phase !== GamePhase.WAVE) {
    castingSpell.value = null
    uiAudio.cancel()
    return
  }
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
      :data-testid="`spell-${spell.id}`"
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
      <SpellIcon :spell-id="spell.id" />
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
  background: var(--overlay-panel-bg);
  color: var(--spell-color, #888);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: bold;
  overflow: hidden;
  transition: background 120ms, transform 80ms;
}

.spell-btn:hover:not(:disabled) {
  background: var(--overlay-cell-hover);
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
  font-size: var(--text-xs);
  color: #fff;
  z-index: 2;
}

.spell-cost {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: var(--text-xs);
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
