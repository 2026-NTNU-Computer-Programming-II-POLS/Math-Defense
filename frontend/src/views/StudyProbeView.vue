<script setup lang="ts">
/**
 * StudyProbeView.vue — Empirical Validity Probe runner (Spec §27.2).
 *
 * Renders one of three forms (`pre` / `post` / `delay`), 10 multiple-choice
 * items each, and submits to `POST /api/study/probe`. The form and study id
 * are taken from the URL (`?study_id=...&form=...`) so the protocol can
 * deep-link participants from an email or course LMS.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api'
import { PROBE_FORMS_DEFAULT, isProbeForm } from '@/views/study-helpers'
import { PROBE_FORM_LABEL, PROBE_ITEMS, type ProbeForm } from '@/data/probe-items'
import { studyService } from '@/services/studyService'

const route = useRoute()
const router = useRouter()

const studyId = computed(() => String(route.query.study_id ?? '').trim())
const formParam = computed<ProbeForm>(() => {
  const v = String(route.query.form ?? '')
  return isProbeForm(v) ? v : PROBE_FORMS_DEFAULT
})

const items = computed(() => PROBE_ITEMS[formParam.value])

// Selected option per item id. Empty string = unanswered.
const answers = ref<Record<string, string>>({})

const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<{ score: number; total: number } | null>(null)

const allAnswered = computed(() =>
  items.value.every((it) => !!answers.value[it.id]),
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
    const responses = items.value.map((it) => ({
      item_id: it.id,
      selected: answers.value[it.id],
    }))
    const res = await studyService.submitProbe(studyId.value, formParam.value, responses)
    result.value = res
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
  <main class="probe-view" aria-labelledby="probe-title">
    <header class="probe-header">
      <h1 id="probe-title">Math Knowledge Probe</h1>
      <p class="probe-meta">
        Form: <strong>{{ PROBE_FORM_LABEL[formParam] }}</strong>
        <span v-if="studyId"> · Study: <code>{{ studyId }}</code></span>
      </p>
      <p v-if="!studyId" class="probe-warning">
        This page needs a <code>study_id</code> query parameter to record your responses.
      </p>
    </header>

    <section v-if="!result" class="probe-body">
      <ol class="probe-list">
        <li
          v-for="(item, idx) in items"
          :key="item.id"
          class="probe-item"
        >
          <p class="probe-stem">
            <span class="probe-num">{{ idx + 1 }}.</span>
            {{ item.stem }}
          </p>
          <fieldset class="probe-options">
            <legend class="visually-hidden">Options for question {{ idx + 1 }}</legend>
            <label
              v-for="opt in item.options"
              :key="opt.value"
              class="probe-option"
              :class="{ selected: answers[item.id] === opt.value }"
            >
              <input
                v-model="answers[item.id]"
                type="radio"
                :name="item.id"
                :value="opt.value"
              />
              <span class="probe-option-text">
                <span class="probe-option-label">{{ opt.value }}.</span>
                {{ opt.text }}
              </span>
            </label>
          </fieldset>
        </li>
      </ol>

      <p v-if="error" class="probe-error" role="alert">{{ error }}</p>

      <div class="probe-actions">
        <button
          type="button"
          class="probe-submit"
          :disabled="!allAnswered || submitting || !studyId"
          @click="submit"
        >
          {{ submitting ? 'Submitting…' : 'Submit responses' }}
        </button>
      </div>
    </section>

    <section v-else class="probe-result" role="status">
      <h2>Thank you</h2>
      <p>
        You scored <strong>{{ result.score }} / {{ result.total }}</strong>.
        Your responses have been recorded.
      </p>
      <button type="button" class="probe-submit" @click="backToMenu">
        Back to menu
      </button>
    </section>
  </main>
</template>

<style scoped>
.probe-view {
  max-width: 760px;
  margin: 2rem auto;
  padding: 0 1.25rem 3rem;
  color: var(--color-text, #ddd);
}
.probe-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}
.probe-meta {
  margin: 0;
  color: var(--color-text-muted, #aaa);
  font-size: 0.95rem;
}
.probe-warning {
  background: rgba(255, 165, 0, 0.12);
  border: 1px solid rgba(255, 165, 0, 0.4);
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  margin-top: 0.75rem;
}
.probe-list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
}
.probe-item {
  margin-bottom: 1.5rem;
  padding: 1rem 1.1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}
.probe-stem {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  line-height: 1.45;
}
.probe-num {
  display: inline-block;
  margin-right: 0.4rem;
  color: var(--color-accent, #6db);
  font-weight: 600;
}
.probe-options {
  border: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}
.probe-option {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.55rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.probe-option:hover {
  background: rgba(255, 255, 255, 0.04);
}
.probe-option.selected {
  border-color: var(--color-accent, #6db);
  background: rgba(110, 220, 187, 0.08);
}
.probe-option input[type="radio"] {
  margin-top: 0.2rem;
}
.probe-option-label {
  font-weight: 600;
  margin-right: 0.25rem;
  color: var(--color-accent, #6db);
}
.probe-actions {
  margin-top: 1.5rem;
  text-align: right;
}
.probe-submit {
  background: var(--color-accent, #6db);
  color: #0a1118;
  border: none;
  padding: 0.6rem 1.4rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.probe-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.probe-error {
  color: #ff8a8a;
  margin-top: 1rem;
}
.probe-result {
  text-align: center;
  margin-top: 2rem;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  overflow: hidden;
}
</style>
