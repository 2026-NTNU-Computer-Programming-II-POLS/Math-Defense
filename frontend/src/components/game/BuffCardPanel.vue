<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const gameStore = useGameStore()

const cards = computed(() => gameStore.buffCards)

// Guard against rapid double-click: once a card is selected, block further
// selections until BUFF_RESULT fires (normal path), the buff phase ends
// (cards cleared / PHASE_CHANGED away), or the component unmounts. A 10s
// wall-clock failsafe releases the lock if the engine ever drops both the
// BUFF_RESULT event and the PHASE_CHANGED exit — 10s is long enough that
// a still-processing engine has comfortably finished, so re-enabling at
// that point can only un-wedge a genuinely stuck panel.
const GUARD_FAILSAFE_MS = 10_000
const selectingCardId = ref<string | null>(null)
const panelRef = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let guardTimer: number | null = null

function clearGuard(): void {
  selectingCardId.value = null
  if (guardTimer !== null) {
    window.clearTimeout(guardTimer)
    guardTimer = null
  }
}

function armGuardFailsafe(): void {
  if (guardTimer !== null) window.clearTimeout(guardTimer)
  guardTimer = window.setTimeout(() => {
    guardTimer = null
    if (selectingCardId.value !== null) clearGuard()
  }, GUARD_FAILSAFE_MS)
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const box = panelRef.value
  if (!box) return
  const focusables = box.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event: KeyboardEvent): void {
  trapFocus(event)
  onHotkey(event)
}

function onHotkey(event: KeyboardEvent): void {
  // 1/2/3 shortcuts — pick the Nth card (A-7). Ignore if user is typing.
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
  const idx = ['1', '2', '3'].indexOf(event.key)
  if (idx === -1) return
  const card = cards.value[idx]
  if (!card) return
  event.preventDefault()
  selectCard(card.id)
}

watch(() => gameStore.phase, (_, from) => {
  if (from === GamePhase.BUFF_SELECT) clearGuard()
})

onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  await nextTick()
  const first = panelRef.value?.querySelector<HTMLButtonElement>('button:not([disabled])')
  first?.focus()
})

onUnmounted(() => {
  clearGuard()
  // Restore pre-panel focus (A-7)
  const target = previousFocus
  previousFocus = null
  const focusable = target
    && document.contains(target)
    && (target as HTMLElement).offsetParent !== null
    && !(target as HTMLInputElement).disabled
    && typeof target.focus === 'function'
  if (focusable) {
    try { target.focus() } catch { /* detached — ignore */ }
  }
})

// If the panel closes (e.g. buff phase ends) before BUFF_RESULT fires, reset
// the guard so the next round starts clean.
watch(cards, (v) => {
  if (v.length === 0) clearGuard()
})

function selectCard(cardId: string): void {
  if (selectingCardId.value !== null) return
  selectingCardId.value = cardId
  armGuardFailsafe()
  gameStore.selectBuffCard(cardId)
}

function skipBuff(): void {
  if (selectingCardId.value !== null) return
  selectingCardId.value = ''
  armGuardFailsafe()
  gameStore.selectBuffCard('')
}
</script>

<template>
  <div
    class="buff-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Buff card selection"
    @keydown="onKeydown"
  >
    <div ref="panelRef" class="buff-panel rune-panel" tabindex="-1">
      <h3 class="buff-title">⊕ Shrine of Fate — Choose Your Destiny</h3>

      <p v-if="cards.length === 0" class="empty-state">
        No buff cards available this round — skip to continue.
      </p>

      <div v-else class="card-list">
        <button
          v-for="(card, i) in cards"
          :key="card.id"
          :class="['buff-card', { curse: card.isCurse }]"
          :disabled="selectingCardId !== null"
          :aria-label="`Option ${i + 1}: ${card.name}. ${card.description}. ${card.isCurse ? 'Curse' : 'Buff'}. Press ${i + 1} to choose.`"
          :aria-keyshortcuts="String(i + 1)"
          @click="selectCard(card.id)"
        >
          <div class="card-name" :class="{ 'curse-name': card.isCurse }">
            {{ card.name }}
          </div>
          <div class="card-desc">{{ card.description }}</div>
          <div class="card-footer">
            <span v-if="card.isCurse" class="card-reward">
              + {{ card.goldReward ?? 0 }} Gold
            </span>
            <span v-else class="card-cost">
              {{ card.cost > 0 ? `⬡ ${card.cost}` : 'Free' }}
            </span>
            <span class="card-prob">
              {{ card.isCurse ? '100%' : `${Math.round(card.probability * 100)}%` }}
            </span>
          </div>
        </button>
      </div>

      <button
        class="btn skip-btn"
        :disabled="selectingCardId !== null"
        @click="skipBuff"
      >Skip</button>
    </div>
  </div>
</template>

<style scoped>
.buff-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-overlay);
}

.buff-panel {
  width: min(680px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.buff-title {
  font-size: 14px;
  color: var(--gold);
  letter-spacing: 4px;
  text-align: center;
}

.card-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.buff-card {
  flex: 1 1 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--grid-line);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.buff-card:hover {
  border-color: var(--gold);
  background: rgba(212,168,64,0.08);
}

/* Keyboard focus indicator (A-8) */
.buff-card:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

.buff-card.curse {
  border-color: rgba(184,64,64,0.4);
}

.buff-card.curse:hover {
  border-color: var(--enemy-red);
  background: rgba(184,64,64,0.08);
}

.card-name {
  font-size: 11px;
  color: var(--gold);
  letter-spacing: 1px;
}

.curse-name { color: var(--enemy-red); }

/* T-2 + T-3: bump size to 12px and lift contrast from #9a8a70 (≈4.2:1) to
   #c9b895 on the panel background so small body text clears WCAG AA. */
.card-desc {
  font-size: 12px;
  color: #c9b895;
  line-height: 1.5;
  flex: 1;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-cost  { font-size: 11px; color: var(--gold-bright); }
.card-reward { font-size: 11px; color: var(--hp-green); }
.card-prob  { font-size: 10px; color: var(--axis); }

.empty-state {
  font-size: 12px;
  color: var(--axis);
  text-align: center;
  letter-spacing: 1px;
  padding: 12px 0;
}

.skip-btn {
  align-self: center;
  letter-spacing: 4px;
  border-color: var(--axis);
  color: var(--axis);
}
</style>
