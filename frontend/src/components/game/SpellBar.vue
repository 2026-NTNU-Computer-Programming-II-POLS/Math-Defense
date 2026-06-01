<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SPELL_DEFS } from '@/data/spell-defs'
import { Events } from '@/data/constants'
import SpellIcon from './SpellIcon.vue'
import { getSpellIconDef } from './spell-icon-defs'

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

// A spell whose effect lingers (currently only Acceleration/haste) registers
// an active buff under the SAME name via BuffSystem.applyExternalBuff. Match by
// name so the spell cell can surface the live EFFECT time, distinct from the
// recharge COOLDOWN — the two are independent timers (e.g. Acceleration's 8 s
// effect vs its 25 s cooldown). `remainingTime` is the engine's live value
// (BuffSystem ticks it during WAVE; gameStore mirrors the array every Nth
// frame), so read it directly. Returns null when the spell has no active buff
// (instant spells never register one).
function liveSpellBuffRemaining(name: string): number | null {
  const buff = g.activeBuffs.find((b) => b.name === name)
  if (!buff) return null
  return buff.remainingTime
}

const spells = computed(() =>
  SPELL_DEFS.map((s) => {
    const cd = g.spellCooldowns[s.id] ?? 0
    // The button styling reads from the HUD-layer icon registry, not from the
    // in-canvas VFX colour on `SpellDef.color` — the two concerns are tuned
    // against different backgrounds.
    const iconColor = getSpellIconDef(s.id).color
    const buffRemaining = liveSpellBuffRemaining(s.name)
    const buffActive = buffRemaining !== null && buffRemaining > 0
    return {
      ...s,
      iconColor,
      onCooldown: cd > 0,
      cooldownPct: cd > 0 ? (cd / s.cooldown) * 100 : 0,
      cooldownLabel: cd > 0 ? Math.ceil(cd) + 's' : '',
      affordable: g.gold >= s.cost,
      buffActive,
      buffLabel: buffActive ? Math.ceil(buffRemaining!) + 's' : '',
    }
  }),
)

function selectSpell(spellId: string): void {
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
        'buff-active': spell.buffActive,
        unaffordable: !spell.affordable && !spell.onCooldown,
        casting: castingSpell === spell.id,
      }"
      :style="{ '--spell-color': spell.iconColor }"
      :disabled="spell.onCooldown || !spell.affordable"
      :title="`${spell.name} (${spell.cost}g) — ${spell.description}`"
      :aria-label="`${spell.name}, costs ${spell.cost} gold${spell.buffActive ? `, effect active ${spell.buffLabel}` : ''}${spell.onCooldown ? `, on cooldown ${spell.cooldownLabel}` : ''}`"
      @click="selectSpell(spell.id)"
    >
      <SpellIcon :spell-id="spell.id" />
      <span v-if="spell.onCooldown" class="cd-overlay" :style="{ height: `${spell.cooldownPct}%` }" />
      <span v-if="spell.onCooldown" class="cd-label">{{ spell.cooldownLabel }}</span>
      <!-- Active-effect indicator: top accent bar + label in the spell colour,
           shown alongside (and distinct from) the bottom cooldown readout. -->
      <span v-if="spell.buffActive" class="buff-bar" aria-hidden="true" />
      <span v-if="spell.buffActive" class="buff-label">{{ spell.buffLabel }}</span>
      <span class="spell-cost">{{ spell.cost }}</span>
    </button>
  </div>
</template>

<style scoped>
.spell-bar {
  display: flex;
  gap: 6px;
}

/* White rounded-square buttons (mockup): subtle neutral border, the spell's
   glyph centred, cooldown seconds in muted text below. */
.spell-btn {
  position: relative;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--spell-color, #888);
  cursor: pointer;
  font-family: var(--font-mono);
  font-weight: bold;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: background 120ms, border-color 120ms, transform 80ms;
}

.spell-btn:hover:not(:disabled) {
  background: #fff;
  border-color: var(--spell-color, var(--terracotta));
  transform: translateY(-1px);
}

/* Specificity bump (`:not(:disabled)`) so a hovered button mid-cast keeps the
   casting glow rather than collapsing to the lighter hover border. */
.spell-btn.casting:not(:disabled) {
  border-color: var(--spell-color, var(--gold-deep));
  box-shadow: 0 0 8px var(--spell-color, var(--gold-soft));
}

.spell-btn.on-cooldown {
  cursor: not-allowed;
}

.spell-btn.unaffordable {
  opacity: 0.4;
}

.cd-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(95, 118, 142, 0.12);
  transition: height 200ms linear;
}

.cd-label {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  font-weight: 700;
  z-index: 2;
}

/* Active-effect indicator (distinct from cooldown): a glowing top accent bar
   plus a seconds label at the top-left, both in the spell's colour. Cooldown
   lives at the bottom (rising overlay + bottom label), so a spell that is both
   mid-effect and recharging — e.g. Acceleration in its first 8 s — shows both
   timers without overlap. */
.buff-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--spell-color, var(--sage));
  box-shadow: 0 0 6px var(--spell-color, var(--sage));
  z-index: 2;
}

.spell-btn.buff-active {
  border-color: var(--spell-color, var(--sage-deep));
}

.buff-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: var(--text-2xs);
  line-height: 1;
  letter-spacing: -0.2px;
  color: var(--spell-color, var(--sage-deep));
  font-weight: 700;
  z-index: 2;
}

/* Compact cost badge tucked into the top-right corner so it stays clear of
   the centred glyph (a 3-digit cost no longer covers the icon). */
.spell-cost {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: var(--text-2xs);
  line-height: 1;
  letter-spacing: -0.2px;
  color: var(--gold-deep);
  font-weight: 700;
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
