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
  margin: 2rem auto;
  padding: 0 1.25rem 3rem;
  color: var(--text-primary);
}
.affect-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}
.affect-meta {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
.affect-warning {
  background: var(--gold-tint);
  border: 1px solid var(--gold-dim);
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  margin-top: 0.75rem;
}
.affect-instructions {
  margin: 1rem 0 0;
  color: var(--text-secondary);
}
.affect-list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
}
.affect-item {
  margin-bottom: 1.4rem;
  padding: 1rem 1.1rem;
  background: var(--card-surface);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}
.affect-stem {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}
.affect-num {
  margin-right: 0.4rem;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-weight: 600;
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
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.likert-cell:hover {
  background: var(--gold-tint-hover);
}
.likert-cell.selected {
  border-color: var(--gold);
  background: var(--gold-tint-select);
}
.likert-cell input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.likert-num {
  font-weight: 700;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
}
.likert-text {
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.affect-actions {
  margin-top: 1.5rem;
  text-align: right;
}
.affect-submit {
  background: var(--gold);
  color: var(--text-on-accent);
  border: none;
  padding: 0.6rem 1.4rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.affect-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.affect-error {
  color: var(--error-red);
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
