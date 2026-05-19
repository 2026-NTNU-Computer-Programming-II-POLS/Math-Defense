<script setup lang="ts">
/**
 * AffectSurveyView.vue — short Likert survey at pre/post (Spec §27.2).
 * Anxiety subscale is Ashcraft (2002, short form); motivation subscale is
 * the IMI Interest/Enjoyment + Perceived Competence subset (Ryan et al. 2006).
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api'
import { isAffectPhase } from '@/views/study-helpers'
import { AFFECT_ITEMS, LIKERT_ANCHORS, studyService } from '@/services/studyService'

const route = useRoute()
const router = useRouter()

const studyId = computed(() => String(route.query.study_id ?? '').trim())
const phase = computed<'pre' | 'post'>(() => {
  const v = String(route.query.phase ?? '')
  return isAffectPhase(v) ? v : 'pre'
})

const ratings = ref<Record<string, number>>({})

const submitting = ref(false)
const error = ref<string | null>(null)
const submitted = ref(false)

const allAnswered = computed(() =>
  AFFECT_ITEMS.every((it) => Number.isInteger(ratings.value[it.id])),
)

async function submit() {
  if (!allAnswered.value || submitting.value) return
  if (!studyId.value) {
    error.value = 'Missing study_id in URL.'
    return
  }
  submitting.value = true
  error.value = null
  try {
    const anxietyItems: number[] = []
    const motivationItems: number[] = []
    for (const item of AFFECT_ITEMS) {
      const v = ratings.value[item.id]
      if (item.subscale === 'anxiety') anxietyItems.push(v)
      else motivationItems.push(v)
    }
    await studyService.submitAffect(studyId.value, phase.value, anxietyItems, motivationItems)
    submitted.value = true
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Submission failed; please try again.'
  } finally {
    submitting.value = false
  }
}

function backToMenu() {
  router.push({ name: 'menu' })
}
</script>

<template>
  <main class="affect-view" aria-labelledby="affect-title">
    <header class="affect-header">
      <h1 id="affect-title">How do you feel about math?</h1>
      <p class="affect-meta">
        Phase: <strong>{{ phase === 'pre' ? 'Pre-survey' : 'Post-survey' }}</strong>
        <span v-if="studyId"> · Study: <code>{{ studyId }}</code></span>
      </p>
      <p v-if="!studyId" class="affect-warning">
        This page needs a <code>study_id</code> query parameter to record your responses.
      </p>
    </header>

    <section v-if="!submitted" class="affect-body">
      <p class="affect-instructions">
        For each statement, choose the response that best matches how you feel
        right now. There are no right or wrong answers.
      </p>

      <ol class="affect-list">
        <li v-for="(item, idx) in AFFECT_ITEMS" :key="item.id" class="affect-item">
          <p class="affect-stem">
            <span class="affect-num">{{ idx + 1 }}.</span>
            {{ item.text }}
          </p>
          <div class="likert" role="radiogroup" :aria-label="item.text">
            <label
              v-for="anchor in LIKERT_ANCHORS"
              :key="anchor.value"
              class="likert-cell"
              :class="{ selected: ratings[item.id] === anchor.value }"
            >
              <input
                v-model.number="ratings[item.id]"
                type="radio"
                :name="item.id"
                :value="anchor.value"
              />
              <span class="likert-num">{{ anchor.value }}</span>
              <span class="likert-text">{{ anchor.text }}</span>
            </label>
          </div>
        </li>
      </ol>

      <p v-if="error" class="affect-error" role="alert">{{ error }}</p>

      <div class="affect-actions">
        <button
          type="button"
          class="affect-submit"
          :disabled="!allAnswered || submitting || !studyId"
          @click="submit"
        >
          {{ submitting ? 'Submitting…' : 'Submit responses' }}
        </button>
      </div>
    </section>

    <section v-else class="affect-result" role="status">
      <h2>Thank you</h2>
      <p>Your responses have been recorded.</p>
      <button type="button" class="affect-submit" @click="backToMenu">
        Back to menu
      </button>
    </section>
  </main>
</template>

<style scoped>
.affect-view {
  max-width: 760px;
  margin: 40px auto;
  padding: 26px;
  color: var(--charcoal);
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.affect-header h1 {
  margin: 0 0 0.25rem;
  font-size: var(--text-xl);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
}
.affect-meta {
  margin: 0;
  color: var(--charcoal-soft);
  font-size: var(--text-base);
}
.affect-warning {
  background: rgba(168, 188, 203, 0.2);
  border: 1px solid var(--terracotta);
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  margin-top: 0.75rem;
}
.affect-instructions {
  margin: 1rem 0 0;
  color: var(--charcoal-soft);
}
.affect-list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
}
.affect-item {
  margin-bottom: 1.4rem;
  padding: 1rem 1.1rem;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.affect-stem {
  margin: 0 0 0.6rem;
  font-size: var(--text-base);
}
.affect-num {
  margin-right: 0.4rem;
  color: var(--terracotta-deep);
  font-weight: 700;
}
.likert {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.4rem;
}
.likert-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 0.4rem;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.likert-cell:hover {
  background: rgba(245, 250, 254, 0.7);
}
.likert-cell.selected {
  border-color: var(--terracotta-deep);
  background: var(--terracotta);
}
.likert-cell input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.likert-num {
  font-weight: 700;
  color: var(--charcoal);
}
.likert-cell.selected .likert-num,
.likert-cell.selected .likert-text {
  color: #fff;
}
.likert-text {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
}
.affect-actions {
  margin-top: 1.5rem;
  text-align: right;
}
.affect-submit {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  color: #fff;
  border: 1px solid var(--gold-deep);
  padding: 0.6rem 1.4rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}
.affect-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.affect-error {
  color: var(--clay-deep);
  margin-top: 1rem;
}
.affect-result {
  text-align: center;
  margin-top: 2rem;
}
@media (max-width: 600px) {
  .likert {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .likert-text {
    display: none;
  }
}
</style>
