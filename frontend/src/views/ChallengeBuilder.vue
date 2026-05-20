<script setup lang="ts">
// ChallengeBuilder.vue — teacher form for Generative Challenge Mode (spec §23).
// Mirrors TeacherTerritorySetup.vue layout/styles. Emits ChallengeCreatePayload
// on submit; on success redirects to /challenge/:id (the deep-link).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  challengeService,
  type Challenge,
  type ChallengeMechanic,
  type ChallengeTowerType,
} from '@/services/challengeService'

const router = useRouter()

const TOWER_OPTIONS: { value: ChallengeTowerType; label: string }[] = [
  { value: 'magic',    label: 'Magic' },
  { value: 'radarA',   label: 'Radar A' },
  { value: 'radarB',   label: 'Radar B' },
  { value: 'radarC',   label: 'Radar C' },
  { value: 'matrix',   label: 'Matrix' },
  { value: 'limit',    label: 'Limit' },
  { value: 'calculus', label: 'Calculus' },
]

const MECHANIC_OPTIONS: { value: ChallengeMechanic; label: string }[] = [
  { value: 'calculus_pet', label: 'Calculus pet' },
  { value: 'monty_hall',   label: 'Monty Hall door' },
  { value: 'chain_rule',   label: 'Chain rule overlay' },
  { value: 'buffs',        label: 'Buff cards' },
  { value: 'spells',       label: 'Spells' },
]

// Default magic-coefficient ranges — must mirror MAGIC_DEFAULT_BOUNDS in
// backend/app/domain/challenge/constraint_dsl.py. The schema rejects bounds
// outside these so we expose them as the slider min/max.
const DEFAULT_BOUNDS: Record<'a' | 'b' | 'c', [number, number]> = {
  a: [-3, 3],
  b: [-5, 5],
  c: [-5, 5],
}

const title = ref('')
const description = ref('')
const allowedTowers = ref<Set<ChallengeTowerType>>(new Set(['magic']))
const forbiddenMechanics = ref<Set<ChallengeMechanic>>(new Set())
const waveCount = ref(3)
const targetScore = ref(1500)

// Each magic coefficient is opt-in: enable[k] gates whether the bound is sent.
const magicEnable = ref<Record<'a' | 'b' | 'c', boolean>>({
  a: false, b: false, c: false,
})
const magicLo = ref<Record<'a' | 'b' | 'c', number>>({ a: -3, b: -5, c: -5 })
const magicHi = ref<Record<'a' | 'b' | 'c', number>>({ a:  3, b:  5, c:  5 })

const submitting = ref(false)
const error = ref('')
const myChallenges = ref<Challenge[]>([])

const canSubmit = computed(() =>
  title.value.trim().length > 0
  && allowedTowers.value.size > 0
  && !submitting.value,
)

function toggleTower(t: ChallengeTowerType): void {
  if (allowedTowers.value.has(t)) allowedTowers.value.delete(t)
  else allowedTowers.value.add(t)
  // Force reactivity on Set mutation.
  allowedTowers.value = new Set(allowedTowers.value)
}

function toggleMechanic(m: ChallengeMechanic): void {
  if (forbiddenMechanics.value.has(m)) forbiddenMechanics.value.delete(m)
  else forbiddenMechanics.value.add(m)
  forbiddenMechanics.value = new Set(forbiddenMechanics.value)
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  // Validate any enabled bound has lo <= hi.
  for (const k of ['a', 'b', 'c'] as const) {
    if (magicEnable.value[k] && magicLo.value[k] > magicHi.value[k]) {
      error.value = `Magic ${k}: lower bound must be ≤ upper bound`
      return
    }
  }
  error.value = ''
  submitting.value = true
  try {
    const magic_param_bounds: { a?: [number, number]; b?: [number, number]; c?: [number, number] } = {}
    for (const k of ['a', 'b', 'c'] as const) {
      if (magicEnable.value[k]) {
        magic_param_bounds[k] = [magicLo.value[k], magicHi.value[k]]
      }
    }
    const created = await challengeService.create({
      title: title.value.trim(),
      description: description.value.trim(),
      constraints: {
        allowed_towers: [...allowedTowers.value],
        magic_param_bounds,
        forbidden_mechanics: [...forbiddenMechanics.value],
        wave_count: waveCount.value,
        target_score: targetScore.value,
      },
    })
    router.push(created.deep_link)
  } catch (e: unknown) {
    error.value = (e instanceof Error ? e.message : 'Failed to create challenge')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    myChallenges.value = await challengeService.listMine()
  } catch {
    myChallenges.value = []
  }
})
</script>

<template>
  <div class="setup-view">
    <div class="setup-panel rune-panel">
      <h2 class="setup-title">Create Challenge</h2>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <form class="setup-form" @submit.prevent="submit">
        <div class="field">
          <label class="field-label">Title</label>
          <input v-model="title" type="text" maxlength="120" class="rune-input" placeholder="e.g. Magic-only sprint" />
        </div>

        <div class="field">
          <label class="field-label">Description</label>
          <textarea v-model="description" maxlength="500" rows="2" class="rune-input" placeholder="Optional brief for students" />
        </div>

        <div class="field">
          <label class="field-label">Allowed Towers</label>
          <div class="checkbox-grid">
            <label v-for="opt in TOWER_OPTIONS" :key="opt.value" class="checkbox-row">
              <input
                type="checkbox"
                :checked="allowedTowers.has(opt.value)"
                @change="toggleTower(opt.value)"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Magic coefficient bounds (optional)</label>
          <div class="magic-grid">
            <div v-for="k in (['a','b','c'] as const)" :key="k" class="magic-row">
              <label class="checkbox-row">
                <input type="checkbox" v-model="magicEnable[k]" />
                <span class="coef-label">{{ k }}</span>
              </label>
              <input
                v-model.number="magicLo[k]"
                type="number"
                step="0.1"
                :min="DEFAULT_BOUNDS[k][0]"
                :max="DEFAULT_BOUNDS[k][1]"
                class="rune-input num-input"
                :disabled="!magicEnable[k]"
              />
              <span class="dash">–</span>
              <input
                v-model.number="magicHi[k]"
                type="number"
                step="0.1"
                :min="DEFAULT_BOUNDS[k][0]"
                :max="DEFAULT_BOUNDS[k][1]"
                class="rune-input num-input"
                :disabled="!magicEnable[k]"
              />
              <span class="hint">default [{{ DEFAULT_BOUNDS[k][0] }}, {{ DEFAULT_BOUNDS[k][1] }}]</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Forbidden Mechanics</label>
          <div class="checkbox-grid">
            <label v-for="opt in MECHANIC_OPTIONS" :key="opt.value" class="checkbox-row">
              <input
                type="checkbox"
                :checked="forbiddenMechanics.has(opt.value)"
                @change="toggleMechanic(opt.value)"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <div class="field row">
          <div class="half">
            <label class="field-label">Wave count</label>
            <input v-model.number="waveCount" type="number" min="1" max="6" class="rune-input num-input" />
          </div>
          <div class="half">
            <label class="field-label">Target score</label>
            <input v-model.number="targetScore" type="number" min="1" max="100000" class="rune-input num-input" />
          </div>
        </div>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="!canSubmit">
            {{ submitting ? 'Creating…' : 'Create Challenge' }}
          </button>
          <button class="btn back-btn" type="button" @click="router.push('/teacher')">Cancel</button>
        </div>
      </form>

      <div v-if="myChallenges.length" class="my-challenges">
        <h3 class="subtitle">Your Challenges</h3>
        <ul class="ch-list">
          <li v-for="c in myChallenges" :key="c.id" class="ch-row">
            <router-link :to="c.deep_link" class="ch-title">{{ c.title }}</router-link>
            <span class="ch-meta">w{{ c.constraints.wave_count }} · target {{ c.constraints.target_score }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: 40px;
}

.setup-panel {
  width: 720px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.setup-title {
  font-size: var(--text-lg);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  text-align: center;
}

.subtitle {
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
  color: var(--charcoal-soft);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-top: 16px;
}

.error-msg { font-size: var(--text-xs); color: var(--clay-deep); }

.setup-form { display: flex; flex-direction: column; gap: 12px; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field.row { flex-direction: row; gap: 12px; }
.half { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: var(--text-xs); color: var(--charcoal-soft); font-weight: 500; }

.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 12px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--charcoal);
  cursor: pointer;
}

.magic-grid { display: flex; flex-direction: column; gap: 6px; }
.magic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);
}
.coef-label {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs);
  color: var(--terracotta-deep);
  min-width: 12px;
}
.num-input { width: 70px; }
.dash { color: var(--charcoal-soft); }
.hint { color: var(--charcoal-soft); font-size: var(--text-2xs); opacity: 0.8; }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; }
.back-btn { border-color: var(--line); color: var(--charcoal-soft); }
.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.my-challenges { display: flex; flex-direction: column; gap: 6px; }
.ch-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.ch-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.ch-title { color: var(--terracotta-deep); font-weight: 600; text-decoration: none; }
.ch-title:hover { text-decoration: underline; }
.ch-meta { color: var(--charcoal-soft); font-size: var(--text-xs); }
</style>
