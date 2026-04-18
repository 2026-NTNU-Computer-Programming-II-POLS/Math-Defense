<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, GamePhase } from '@/data/constants'

const gameStore = useGameStore()

const cards = computed(() => gameStore.buffCards)

// Guard against rapid double-click: once a card is selected, block further
// selections until BUFF_RESULT fires (normal path), the buff phase ends
// (cards cleared / PHASE_CHANGED away), or the component unmounts. No
// wall-clock failsafe — it would either fire too early (re-enabling clicks
// on a stale round while the engine is still processing) or too late to
// matter. The phase watchers below cover every exit route the engine can
// take, including the "engine dropped BUFF_RESULT" case.
const selectingCardId = ref<string | null>(null)
let unsubBuffResult: (() => void) | null = null
let unsubPhase: (() => void) | null = null

function clearGuard(): void {
  selectingCardId.value = null
}

onMounted(() => {
  const game = gameStore.getEngine()
  if (!game) return
  unsubBuffResult = game.eventBus.on(Events.BUFF_RESULT, () => {
    clearGuard()
  })
  // Defensive belt-and-braces: if BUFF_RESULT is somehow never fired but the
  // engine leaves the BUFF_SELECT phase anyway, release the guard so the
  // next buff round isn't pre-blocked.
  unsubPhase = game.eventBus.on(Events.PHASE_CHANGED, ({ from }) => {
    if (from === GamePhase.BUFF_SELECT) clearGuard()
  })
})

onUnmounted(() => {
  unsubBuffResult?.()
  unsubBuffResult = null
  unsubPhase?.()
  unsubPhase = null
  clearGuard()
})

// If the panel closes (e.g. buff phase ends) before BUFF_RESULT fires, reset
// the guard so the next round starts clean.
watch(cards, (v) => {
  if (v.length === 0) clearGuard()
})

function selectCard(cardId: string): void {
  if (selectingCardId.value !== null) return
  const game = gameStore.getEngine()
  if (!game) return
  selectingCardId.value = cardId
  game.eventBus.emit(Events.BUFF_CARD_SELECTED, cardId)
}

function skipBuff(): void {
  if (selectingCardId.value !== null) return
  const game = gameStore.getEngine()
  if (!game) return
  selectingCardId.value = ''
  game.eventBus.emit(Events.BUFF_CARD_SELECTED, '')
}
</script>

<template>
  <div class="buff-overlay">
    <div class="buff-panel rune-panel">
      <h3 class="buff-title">⊕ 機率神殿 — 選擇命運</h3>

      <div class="card-list">
        <button
          v-for="card in cards"
          :key="card.id"
          :class="['buff-card', { curse: card.isCurse }]"
          :disabled="selectingCardId !== null"
          @click="selectCard(card.id)"
        >
          <div class="card-name" :class="{ 'curse-name': card.isCurse }">
            {{ card.name }}
          </div>
          <div class="card-desc">{{ card.description }}</div>
          <div class="card-footer">
            <span v-if="card.isCurse" class="card-reward">
              + {{ (card as { goldReward?: number }).goldReward ?? 0 }} 金
            </span>
            <span v-else class="card-cost">
              {{ card.cost > 0 ? `⬡ ${card.cost}` : '免費' }}
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
      >跳過 (Skip)</button>
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
  z-index: 40;
}

.buff-panel {
  width: 680px;
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
  gap: 12px;
}

.buff-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--grid-line);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.buff-card:hover {
  border-color: var(--gold);
  background: rgba(212,168,64,0.08);
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

.card-desc {
  font-size: 10px;
  color: #9a8a70;
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

.skip-btn {
  align-self: center;
  letter-spacing: 4px;
  border-color: var(--axis);
  color: var(--axis);
}
</style>
