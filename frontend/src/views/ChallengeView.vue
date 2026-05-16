<script setup lang="ts">
// ChallengeView.vue — student-facing lobby for a challenge deep-link (spec §23).
// Loads the challenge, renders the constraints summary, and on "Start" stashes
// the challenge_id in sessionStorage (read by useSessionSync on session create)
// then routes to /level-select so the student can pick the star tier.
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { challengeService, type Challenge } from '@/services/challengeService'
import { CHALLENGE_ID_STORAGE_KEY } from '@/composables/useSessionSync'

const route = useRoute()
const router = useRouter()

const challenge = ref<Challenge | null>(null)
const loading = ref(true)
const error = ref('')

const TOWER_LABELS: Record<string, string> = {
  magic: 'Magic', radarA: 'Radar A', radarB: 'Radar B', radarC: 'Radar C',
  matrix: 'Matrix', limit: 'Limit', calculus: 'Calculus',
}
const MECHANIC_LABELS: Record<string, string> = {
  calculus_pet: 'Calculus pet',
  monty_hall: 'Monty Hall',
  chain_rule: 'Chain rule overlay',
  buffs: 'Buff cards',
  spells: 'Spells',
}

onMounted(async () => {
  const id = route.params.id as string
  try {
    challenge.value = await challengeService.get(id)
  } catch (e: unknown) {
    error.value = (e instanceof Error ? e.message : 'Failed to load challenge')
  } finally {
    loading.value = false
  }
})

function startChallenge(): void {
  if (!challenge.value) return
  try {
    sessionStorage.setItem(CHALLENGE_ID_STORAGE_KEY, challenge.value.id)
  } catch {
    error.value = 'Could not stash challenge id (private browsing mode?). Try a regular window.'
    return
  }
  router.push('/level-select')
}

function goToLeaderboard(): void {
  if (!challenge.value) return
  router.push(`/challenge/${challenge.value.id}/leaderboard`)
}
</script>

<template>
  <div class="setup-view">
    <div class="setup-panel rune-panel">
      <h2 class="setup-title">Challenge</h2>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error-msg">{{ error }}</div>

      <div v-else-if="challenge" class="challenge-detail">
        <div class="title-row">
          <h3 class="ch-title">{{ challenge.title }}</h3>
        </div>
        <p v-if="challenge.description" class="ch-desc">{{ challenge.description }}</p>

        <dl class="constraints">
          <dt>Allowed towers</dt>
          <dd>
            <span v-for="t in challenge.constraints.allowed_towers" :key="t" class="chip">
              {{ TOWER_LABELS[t] ?? t }}
            </span>
          </dd>

          <template v-if="challenge.constraints.forbidden_mechanics.length">
            <dt>Forbidden mechanics</dt>
            <dd>
              <span v-for="m in challenge.constraints.forbidden_mechanics" :key="m" class="chip danger">
                {{ MECHANIC_LABELS[m] ?? m }}
              </span>
            </dd>
          </template>

          <template v-if="Object.keys(challenge.constraints.magic_param_bounds).length">
            <dt>Magic bounds</dt>
            <dd>
              <span
                v-for="(rng, k) in challenge.constraints.magic_param_bounds"
                :key="k"
                class="chip"
              >
                <template v-if="rng">{{ k }} ∈ [{{ rng[0] }}, {{ rng[1] }}]</template>
              </span>
            </dd>
          </template>

          <dt>Wave count</dt>
          <dd>{{ challenge.constraints.wave_count }}</dd>

          <dt>Target score</dt>
          <dd>{{ challenge.constraints.target_score }}</dd>
        </dl>

        <div class="form-actions">
          <button class="btn" type="button" @click="startChallenge">Start</button>
          <button class="btn back-btn" type="button" @click="goToLeaderboard">Rankings</button>
        </div>
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
  width: 480px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setup-title {
  font-size: var(--text-base);
  font-family: var(--font-mono);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 3px;
  text-align: center;
}

.loading { color: var(--axis); text-shadow: var(--gold-shadow); font-size: var(--text-xs); text-align: center; }
.error-msg { font-size: var(--text-xs); color: var(--enemy-red); }

.challenge-detail { display: flex; flex-direction: column; gap: 12px; }
.title-row { display: flex; align-items: baseline; justify-content: space-between; }
.ch-title { font-size: var(--text-sm); color: var(--gold); text-shadow: var(--gold-shadow); margin: 0; }
.ch-desc { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); margin: 0; line-height: 1.4; }

.constraints {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 6px 12px;
  font-size: var(--text-xs);
  margin: 0;
}
.constraints dt { color: var(--gold); text-shadow: var(--gold-shadow); }
.constraints dd { color: var(--axis); text-shadow: var(--gold-shadow); margin: 0; display: flex; flex-wrap: wrap; gap: 4px; }

.chip {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid var(--axis);
  font-size: var(--text-xs);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}
.chip.danger { border-color: var(--enemy-red); color: var(--enemy-red); }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; }
.back-btn { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
