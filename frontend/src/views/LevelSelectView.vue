<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { STAR_MIN, STAR_MAX } from '@/data/difficulty-defs'
import { generateLevel, generateLevelDeterministicFromSeed } from '@/domain/level/level-generator'
import { mulberry32 } from '@/math/MathUtils'
import { isUsingWasm, whenWasmReady } from '@/math/WasmBridge'
import { useAuthStore } from '@/stores/authStore'
import { recommendationService } from '@/services/recommendationService'

const router = useRouter()
const authStore = useAuthStore()
const selectedStar = ref(1)
const generating = ref(false)
const error = ref<string | null>(null)
// Pedagogical_Backlog_Spec §28: surface a "Suggested for you: Star N" badge
// driven by the user's competency posterior. The suggestion is *advisory* —
// the user can still pick any star, and dismissal persists across sessions
// (SDT autonomy: nudging, not gating).
const suggestedStar = ref<number | null>(null)
const RECOMMENDATION_DISMISS_KEY = 'recommendation:dismissed'
const recommendationDismissed = ref<boolean>(
  typeof localStorage !== 'undefined'
    && localStorage.getItem(RECOMMENDATION_DISMISS_KEY) === '1',
)
const showSuggestion = computed(
  () => suggestedStar.value !== null && !recommendationDismissed.value,
)
function dismissSuggestion() {
  recommendationDismissed.value = true
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(RECOMMENDATION_DISMISS_KEY, '1')
  }
}

const stars = Array.from({ length: STAR_MAX - STAR_MIN + 1 }, (_, i) => STAR_MIN + i)

const starLabels: Record<number, string> = {
  1: 'Beginner Training',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Legendary',
}

const STAR_5_LOCK_TOOLTIP =
  'Complete the Initial Answer phase correctly at any star rating to unlock.'

const iaUnlockEarned = computed(() => authStore.user?.ia_unlock_earned === true)

function isStarLocked(star: number): boolean {
  return star === 5 && !iaUnlockEarned.value
}

// Pull the latest profile once on entry so an unlock earned in the previous
// session takes effect without a full reload (Pedagogical_Backlog_Spec §5.3).
onMounted(async () => {
  authStore.refreshProfile()
  // Recommendation fetch is best-effort — a failure (network, 401, anything)
  // must not block level selection.
  try {
    const rec = await recommendationService.me()
    suggestedStar.value = rec.star
  } catch {
    suggestedStar.value = null
  }
})

function selectStar(star: number) {
  if (isStarLocked(star)) return
  selectedStar.value = star
  error.value = null
}

async function startLevel() {
  if (isStarLocked(selectedStar.value)) {
    error.value = STAR_5_LOCK_TOOLTIP
    return
  }
  generating.value = true
  error.value = null
  try {
    const seed = Date.now()
    // construction plan §3.8 — when WASM is ready, generate the level through
    // the bit-deterministic v2 path. The same seed will be used by ReplayView
    // (also v2 path) to recreate the identical level on any browser. If WASM
    // hasn't loaded yet, wait a beat for it; if it still isn't ready, take v1.
    //
    // We MUST NOT silently fall back to v1 when the v2 path was attempted but
    // returned null — useSessionSync tags the resulting session v2 based on
    // isUsingWasm() at session-create time, so a v1-generated level paired
    // with a v2 tag would make ReplayView regenerate a *different* level from
    // the one the player actually played. Throw instead and let the user retry.
    await whenWasmReady().catch(() => false)
    let level
    if (isUsingWasm()) {
      const v2 = generateLevelDeterministicFromSeed(selectedStar.value, seed)
      if (!v2) {
        throw new Error(
          'Level generation failed — the deterministic engine could not produce a ' +
          'valid layout for this seed in 400 attempts. Please try again.',
        )
      }
      level = v2
    } else {
      level = generateLevel(selectedStar.value, mulberry32(seed))
    }
    router.push({
      name: 'initial-answer',
      state: { level: JSON.stringify(level), seed },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="level-select">
    <h1>Select Difficulty</h1>
    <div
      v-if="showSuggestion"
      class="suggestion-badge"
      role="status"
      aria-live="polite"
    >
      <span class="suggestion-text">
        Suggested for you: <strong>Star {{ suggestedStar }}</strong>
      </span>
      <button
        type="button"
        class="suggestion-dismiss"
        aria-label="Dismiss suggestion"
        @click="dismissSuggestion"
      >×</button>
    </div>
    <div class="star-grid">
      <button
        v-for="star in stars"
        :key="star"
        class="star-card"
        :class="{ selected: selectedStar === star, locked: isStarLocked(star) }"
        :disabled="isStarLocked(star)"
        :title="isStarLocked(star) ? STAR_5_LOCK_TOOLTIP : undefined"
        :aria-disabled="isStarLocked(star) || undefined"
        @click="selectStar(star)"
      >
        <div class="star-icons">
          <span v-for="s in star" :key="s" class="star-icon">&#9733;</span>
        </div>
        <div class="star-label">{{ starLabels[star] }}</div>
        <div v-if="isStarLocked(star)" class="lock-badge" aria-hidden="true">
          &#128274;
        </div>
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="start-btn" :disabled="generating" @click="startLevel">
      {{ generating ? 'Generating...' : 'Generate Level' }}
    </button>
    <button class="back-btn" @click="router.push({ name: 'menu' })">Back</button>
  </div>
</template>

<style scoped>
.level-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: var(--text-primary);
  min-height: 100vh;
  background: var(--stone-dark);
}

h1 {
  font-size: 2rem;
  margin-bottom: 2rem;
  color: var(--gold-bright);
}

.star-grid {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 800px;
  margin-bottom: 2rem;
}

.star-card {
  background: var(--stone-light);
  border: 2px solid var(--grid-line);
  border-radius: 8px;
  padding: 1.5rem 1rem;
  cursor: pointer;
  min-width: 140px;
  text-align: center;
  transition: all 0.2s;
  color: var(--text-primary);
}

.star-card:hover {
  border-color: var(--axis);
}

.star-card.selected {
  border-color: var(--gold-bright);
  background: var(--stone-selected);
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}

.star-card.locked,
.star-card[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.6);
}

.star-card.locked:hover {
  border-color: var(--grid-line);
}

.lock-badge {
  margin-top: 0.4rem;
  font-size: 1rem;
  color: var(--axis);
}

.star-icons {
  font-size: 1.5rem;
  color: var(--gold-bright);
  margin-bottom: 0.5rem;
}

.star-label {
  font-size: 0.9rem;
}

.start-btn {
  padding: 0.8rem 2rem;
  font-size: 1.1rem;
  background: var(--tower-cannon);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn:hover:not(:disabled) {
  filter: brightness(1.15);
}

.back-btn {
  padding: 0.5rem 1.5rem;
  background: transparent;
  color: var(--axis);
  border: 1px solid var(--grid-line);
  border-radius: 6px;
  cursor: pointer;
}

.error {
  color: var(--hp-red);
  margin-bottom: 1rem;
}

.suggestion-badge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(212, 168, 64, 0.12);
  border: 1px solid var(--gold-bright, #d4a840);
  color: var(--gold-bright, #d4a840);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  margin-bottom: 1rem;
  font-size: 0.95rem;
}

.suggestion-text strong {
  color: var(--gold-bright, #d4a840);
}

.suggestion-dismiss {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
}

.suggestion-dismiss:hover {
  opacity: 0.7;
}
</style>
