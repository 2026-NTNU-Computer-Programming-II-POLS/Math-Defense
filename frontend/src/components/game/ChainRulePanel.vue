<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, GamePhase } from '@/data/constants'
import MathDisplay from '@/components/common/MathDisplay.vue'
import type { ChainRuleQuestion } from '@/math/chain-rule-generator'

const gameStore = useGameStore()
const question = ref<ChainRuleQuestion | null>(null)
const answered = ref(false)
const unsubs: (() => void)[] = []
const dialogRef = ref<HTMLElement | null>(null)

const visible = computed(() =>
  gameStore.phase === GamePhase.CHAIN_RULE && question.value !== null && !answered.value,
)

onMounted(() => {
  const engine = gameStore.getEngine()
  if (!engine) return
  unsubs.push(
    engine.eventBus.on(Events.CHAIN_RULE_START, (q) => {
      question.value = q as ChainRuleQuestion
      answered.value = false
    }),
    engine.eventBus.on(Events.CHAIN_RULE_END, () => {
      answered.value = true
    }),
  )
})

onUnmounted(() => {
  unsubs.forEach((fn) => fn())
  window.removeEventListener('keydown', handleKey)
})

watch(visible, (val) => {
  if (val) {
    nextTick(() => {
      dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
    })
    window.addEventListener('keydown', handleKey)
  } else {
    window.removeEventListener('keydown', handleKey)
  }
})

function handleKey(e: KeyboardEvent) {
  if (!dialogRef.value) return
  if (e.key === 'Tab') {
    const focusable = Array.from(
      dialogRef.value.querySelectorAll<HTMLElement>('button:not([disabled])')
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
}

function submit(index: number) {
  if (!question.value) return
  const engine = gameStore.getEngine()
  if (!engine) return
  const correct = index === question.value.correctIndex
  engine.eventBus.emit(Events.CHAIN_RULE_ANSWER, { correct })
}
</script>

<template>
  <div v-if="visible" class="chain-rule-overlay">
    <div
      ref="dialogRef"
      class="chain-rule-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cr-title"
    >
      <h3 id="cr-title" class="title">Chain Rule Challenge</h3>
      <p class="prompt">
        Find the derivative of:
      </p>
      <div class="expression">
        <MathDisplay :latex="question!.compositeExpr" :display-mode="true" />
      </div>
      <div class="choices">
        <button
          v-for="(choice, i) in question!.choices"
          :key="i"
          class="btn choice-btn"
          @click="submit(i)"
        >
          <MathDisplay :latex="choice" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chain-rule-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.chain-rule-card {
  background: var(--stone-dark);
  border: 2px solid var(--panel-border);
  border-radius: 8px;
  padding: 24px 32px;
  max-width: 520px;
  width: 90%;
  text-align: center;
}

.title {
  color: var(--gold-bright);
  font-size: 18px;
  margin: 0 0 8px;
}

.prompt {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 12px;
}

.expression {
  background: var(--stone-light);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.choice-btn {
  background: var(--stone-light);
  border: 1px solid var(--grid-line);
  color: var(--text-secondary);
  padding: 12px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s, border-color 0.15s;
}

.choice-btn:hover {
  background: #352840;
  border-color: var(--axis);
}

@media (prefers-reduced-motion: reduce) {
  .choice-btn {
    transition: none;
  }
}
</style>
