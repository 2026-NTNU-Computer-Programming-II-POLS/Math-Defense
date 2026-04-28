<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { outcomeLabel } from '@/math/limit-evaluator'
import type { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import type { LimitResult } from '@/entities/types'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const answered = ref(false)

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const question = computed(() => {
  const t = tower.value
  if (!t) return null
  const engine = gameStore.getEngine()
  const sys = engine?.getSystem('limitTower') as LimitTowerSystem | undefined
  return sys?.generateQuestion(t) ?? null
})

function answer(choice: LimitResult) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.LIMIT_ANSWER, { towerId: props.towerId, answer: choice })
  answered.value = true
}
</script>

<template>
  <div class="limit-panel">
    <template v-if="question && !answered && !tower?.limitResult">
      <p class="question-text">
        Evaluate: lim {{ question.fExpr }} / (x - {{ question.a }}) as x → {{ question.a }}
      </p>
      <div class="choices">
        <button
          v-for="(choice, i) in question.choices"
          :key="i"
          class="btn choice-btn"
          @click="answer(choice)"
        >{{ outcomeLabel(choice) }}</button>
      </div>
    </template>
    <template v-else-if="tower?.limitResult">
      <p class="result-text">
        Result: {{ outcomeLabel(tower.limitResult) }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.limit-panel { display: flex; flex-direction: column; gap: 8px; }
.question-text { font-size: 12px; color: #e8dcc8; margin: 0; line-height: 1.5; }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.choice-btn { font-size: 11px; padding: 8px; }
.result-text { font-size: 12px; color: var(--gold); margin: 0; }
</style>
