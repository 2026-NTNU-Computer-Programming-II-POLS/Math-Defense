<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SPELL_DEFS } from '@/data/spell-defs'
import { Events } from '@/data/constants'

const g = useGameStore()
const castingSpell = ref<string | null>(null)

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
  const engine = g.getEngine()
  if (!engine) return
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
      @click="selectSpell(spell.id)"
    >
      <span class="spell-icon">{{ spell.name[0] }}</span>
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
  width: 40px;
  height: 40px;
  border: 2px solid var(--spell-color, #888);
  border-radius: 6px;
  background: rgba(26, 21, 32, 0.9);
  color: var(--spell-color, #888);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 16px;
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
</style>
