<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { STAR_MIN, STAR_MAX } from '@/data/difficulty-defs'
import { useAuthStore } from '@/stores/authStore'
import { recommendationService } from '@/services/recommendationService'
import { useStartRun } from '@/composables/useStartRun'

const router = useRouter()
const authStore = useAuthStore()
const { startRun } = useStartRun()
const selectedStar = ref(1)
const generating = ref(false)
const error = ref<string | null>(null)
// Pedagogical_Backlog_Spec §28: surface a "Suggested for you: Star N" badge
// driven by the user's competency posterior. The suggestion is *advisory* —
// the user can still pick any star, and dismissal persists across sessions
// (SDT autonomy: nudging, not gating).
const suggestedStar = ref<number | null>(null)
// F-BUG-7: namespace per user so a shared device doesn't leak one
// student's dismiss across logins.
function dismissKey(): string {
  const uid = authStore.user?.id ?? '__anon__'
  return `recommendation:dismissed:${uid}`
}
const recommendationDismissed = ref<boolean>(
  typeof localStorage !== 'undefined'
    && localStorage.getItem(dismissKey()) === '1',
)
const showSuggestion = computed(
  () => suggestedStar.value !== null && !recommendationDismissed.value,
)
function dismissSuggestion() {
  recommendationDismissed.value = true
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(dismissKey(), '1')
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

// Short per-star blurb. Kept in script (not inlined in the template) so the
// content data has a single, readable home — review §3.7.
const starDescriptions: Record<number, string> = {
  1: 'Learn the ropes',
  2: 'Steady waves',
  3: 'Real pressure',
  4: 'Few mistakes',
  5: 'Solve Initial Answer first',
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
  // Fire-and-forget: refreshProfile swallows its own errors internally, so
  // the returned promise never rejects. void marks the intent explicitly.
  void authStore.refreshProfile()
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
    await startRun(selectedStar.value, Date.now())
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="level-select">
    <div class="card ls-card">
      <div class="ls-head">
        <h1 class="title-main">Choose Your Difficulty</h1>
        <p class="motto">Higher stars yield richer rewards — and harsher enemies.</p>
      </div>

      <div
        v-if="showSuggestion"
        class="ls-suggestion"
        role="status"
        aria-live="polite"
      >
        <span class="pill pill-info">
          Suggested: {{ '★'.repeat(suggestedStar || 0) }} — based on your recent
          performance ·
          <a
            href="#"
            class="pill-dismiss"
            aria-label="Dismiss suggestion"
            @click.prevent="dismissSuggestion"
          >dismiss</a>
        </span>
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
          <div
            v-if="isStarLocked(star)"
            class="lock-badge"
            aria-hidden="true"
          >&#128274;</div>
          <div class="stars">{{ '★'.repeat(star) }}</div>
          <div class="name">{{ starLabels[star] }}</div>
          <div class="desc">{{ starDescriptions[star] }}</div>
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="ls-actions">
        <button class="btn btn-ghost" @click="router.push({ name: 'menu' })">
          ← Back
        </button>
        <button
          class="btn btn-primary"
          :disabled="generating"
          @click="startLevel"
        >
          <span class="icon">▶</span>
          <span class="label">{{ generating ? 'Generating…' : 'Generate Level' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.level-select {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 48px 20px;
}

/* `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.motto` and the `.pill`
   base are shared primitives in global.css (review §3.1) — only the
   view-specific tweaks live here. */

.ls-card {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.ls-head {
  text-align: center;
  margin-bottom: 14px;
}

.title-main {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--charcoal);
  letter-spacing: 3px;
  line-height: 1.1;
}

/* ── Suggestion pill ── */
.ls-suggestion {
  text-align: center;
  margin-bottom: 18px;
}

.pill-info {
  background: rgba(107, 127, 148, 0.18);
  color: var(--slate-deep);
  border-color: rgba(107, 127, 148, 0.32);
}

.pill-dismiss {
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}

/* ── Star grid ──
   auto-fit + minmax keeps five columns on desktop and wraps to 2–3 on a
   phone, replacing the fixed 5-column track that overflowed (review §1.3). */
.star-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
  gap: 12px;
}

.star-card {
  position: relative;
  width: 100%;
  text-align: center;
  padding: 18px 8px;
  background: rgba(245, 250, 254, 0.7);
  border: 1px solid var(--line);
  border-radius: 14px;
  cursor: pointer;
  font-family: inherit;
  color: var(--charcoal);
  transition: all 0.16s ease;
}

.star-card:hover {
  border-color: var(--gold);
  background: #fff;
}

.star-card.selected {
  border-color: var(--gold);
  background: #fff;
  box-shadow: 0 8px 22px rgba(173, 162, 132, 0.32);
}

.star-card.locked,
.star-card[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

.star-card.locked:hover {
  border-color: var(--line);
  background: rgba(245, 250, 254, 0.7);
}

/* Lock cue on the Star-5 card while the Initial-Answer unlock is unearned
   (review §2.1 — restores the badge PR #67 dropped). */
.lock-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: var(--text-sm);
  line-height: 1;
}

.star-card .stars {
  font-size: var(--text-xl);
  color: var(--gold);
  margin-bottom: 6px;
  line-height: 1;
}

.star-card .name {
  font-weight: 600;
  font-size: var(--text-sm);
}

.star-card .desc {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  margin-top: 4px;
}

/* ── Actions ── */
.error {
  color: var(--clay-deep);
  font-size: var(--text-sm);
  margin: 18px 0 0;
  text-align: center;
}

.ls-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.btn.btn-ghost {
  flex: 0 0 auto;
}

.btn.btn-primary {
  flex: 1;
}
</style>
