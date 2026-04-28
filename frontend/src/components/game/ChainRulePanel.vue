<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, GamePhase } from '@/data/constants'
import MathDisplay from '@/components/common/MathDisplay.vue'
import type { ChainRuleQuestion } from '@/math/chain-rule-generator'

const gameStore = useGameStore()
const question = ref<ChainRuleQuestion | null>(null)
const answered = ref(false)
const unsubs: (() => void)[] = []

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
})

function submit(index: number) {
  if (!question.value) return
  const engine = gameStore.getEngine()
  if (!engine) return
  const correct = index === question.value.correctIndex
  engine.eventBus.emit(Events.CHAIN_RULE_ANSWER, { correct })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="chain-rule-overlay">
      <div class="chain-rule-card">
        <h3 class="title">Chain Rule Challenge</h3>
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
  </Teleport>
</template>

<style scoped>
.chain-rule-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.chain-rule-card {
  background: #1a1520;
  border: 2px solid #8b7342;
  border-radius: 12px;
  padding: 24px 32px;
  max-width: 520px;
  width: 90%;
  text-align: center;
}

.title {
  color: #ffd700;
  font-size: 18px;
  margin: 0 0 8px;
}

.prompt {
  color: #e8dcc8;
  font-size: 14px;
  margin: 0 0 12px;
}

.expression {
  background: #252030;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.choice-btn {
  background: #252030;
  border: 1px solid #3a3028;
  color: #e8dcc8;
  padding: 12px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s, border-color 0.15s;
}

.choice-btn:hover {
  background: #352840;
  border-color: #8b7342;
}
</style>
