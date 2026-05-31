<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { achievementService, type AchievementOut } from '@/services/achievementService'
import { ACHIEVEMENT_CATEGORIES } from '@/data/achievement-defs'

const SEASONAL = 'seasonal' as const
const router = useRouter()
const achievements = ref<AchievementOut[]>([])
const loading = ref(true)
const error = ref('')
const selectedCategory = ref<string | null>(null)

const PAGE_SIZE = 20
const page = ref(1)

const seasonalAchievements = computed(() =>
  achievements.value.filter(a => a.season_id),
)

const hasSeasonal = computed(() => seasonalAchievements.value.length > 0)

const activeSeasonBanner = computed(() => {
  const a = seasonalAchievements.value.find(x => x.season_active && x.season_ends_at)
  if (!a) return null
  return {
    name: a.season_name ?? a.season_id,
    endsAt: a.season_ends_at as string,
  }
})

const filtered = computed(() => {
  if (!selectedCategory.value) return achievements.value
  if (selectedCategory.value === SEASONAL) return seasonalAchievements.value
  return achievements.value.filter(a => a.category === selectedCategory.value)
})

watch(selectedCategory, () => { page.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paginated = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

const unlockedCount = computed(() => achievements.value.filter(a => a.unlocked).length)
const totalPoints = computed(() =>
  achievements.value.filter(a => a.unlocked).reduce((sum, a) => sum + a.talent_points, 0),
)

function formatEndDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

onMounted(async () => {
  try {
    achievements.value = await achievementService.list()
  } catch {
    error.value = 'Failed to load achievements'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="achievement-view">
    <header class="ach-header">
      <h1 class="ach-title">Achievements</h1>
      <div class="ach-summary">
        <span class="ach-count">{{ unlockedCount }} / {{ achievements.length }}</span>
        <span class="ach-points">{{ totalPoints }} TP earned</span>
      </div>
      <button class="btn" @click="router.push({ name: 'menu' })">← Back</button>
    </header>

    <div class="ach-filters">
      <button
        :class="['btn', 'filter-btn', { active: selectedCategory === null }]"
        @click="selectedCategory = null"
      >All</button>
      <button
        v-for="cat in ACHIEVEMENT_CATEGORIES"
        :key="cat.id"
        :class="['btn', 'filter-btn', { active: selectedCategory === cat.id }]"
        @click="selectedCategory = cat.id"
      >{{ cat.label }}</button>
      <button
        v-if="hasSeasonal"
        :class="['btn', 'filter-btn', 'seasonal-btn', { active: selectedCategory === SEASONAL }]"
        @click="selectedCategory = SEASONAL"
      >Seasonal</button>
    </div>

    <div v-if="activeSeasonBanner" class="season-banner">
      <span class="season-banner-title">★ {{ activeSeasonBanner.name }} — 2× rewards active</span>
      <span class="season-banner-end">ends {{ formatEndDate(activeSeasonBanner.endsAt) }}</span>
    </div>

    <div v-if="loading" class="ach-loading">Loading...</div>
    <div v-else-if="error" class="ach-error">{{ error }}</div>
    <template v-else>
      <div class="ach-grid">
      <div
        v-for="a in paginated"
        :key="a.id"
        :class="['ach-card', {
          unlocked: a.unlocked,
          locked: !a.unlocked,
          'season-active': a.season_id && a.season_active,
          'season-archived': a.season_id && !a.season_active,
        }]"
      >
        <div class="ach-icon">{{ a.unlocked ? '&#10003;' : '&#9679;' }}</div>
        <div class="ach-info">
          <div class="ach-name">
            {{ a.name }}
            <span v-if="a.season_id && a.season_active" class="season-pill">SEASONAL 2×</span>
            <span v-else-if="a.season_id" class="season-pill archived">PAST SEASON</span>
          </div>
          <div class="ach-desc">{{ a.description }}</div>
          <div class="ach-meta">
            <span class="ach-tp">+{{ a.talent_points }} TP</span>
            <span v-if="a.season_id && a.season_ends_at" class="ach-date">
              {{ a.season_active ? 'ends' : 'ended' }} {{ formatEndDate(a.season_ends_at) }}
            </span>
            <span v-else-if="a.unlocked && a.unlocked_at" class="ach-date">
              {{ new Date(a.unlocked_at).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>
    </div>
      <div v-if="totalPages > 1" class="ach-pagination">
        <button class="btn" :disabled="page <= 1" @click="page--">‹ Prev</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="btn" :disabled="page >= totalPages" @click="page++">Next ›</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.achievement-view {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 40px auto;
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ach-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.ach-title {
  font-size: var(--text-lg);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
}

.ach-summary {
  display: flex;
  gap: 16px;
  font-size: var(--text-xs);
}

.ach-count { color: var(--gold-deep); font-weight: 700; }
.ach-points { color: var(--charcoal-soft); }

/* Distribute chips evenly across the row's full width: nowrap keeps everything
   on one line, space-between turns leftover slack into uniform inter-chip
   gaps so the first chip sits flush-left and the last sits flush-right with
   .ach-grid below. `gap` is the minimum spacing if the row ever runs tight. */
.ach-filters { display: flex; gap: 4px; flex-wrap: nowrap; justify-content: space-between; }
.filter-btn.active { background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%); color: #fff; border-color: var(--gold-deep); }
/* Mockup chip style: pill (from shared primitive) + soft inset shadow gives
   inactive chips a recessed feel; active chips get the shared gold gradient
   plus a slight outer raise. Padding is sized so all eight categories (+ All,
   + Seasonal) still fit on the single row inside .ach-grid's container. */
.ach-filters .filter-btn {
  padding: 6px 14px;
  min-height: 32px;
  white-space: nowrap;
  box-shadow: inset 0 1px 2px var(--line);
}
.ach-filters .filter-btn.active { box-shadow: var(--shadow-sm); }

.ach-loading, .ach-error { text-align: center; color: var(--charcoal-soft); padding: 32px; }
.ach-error { color: var(--clay-deep); }

.ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ach-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: rgba(245, 250, 254, 0.75);
  border: 1px solid var(--line);
  border-radius: 12px;
  transition: border-color 0.2s;
}

.ach-card.unlocked {
  border-color: var(--terracotta);
  background: linear-gradient(135deg, rgba(168, 188, 203, 0.24), #fff);
}

.ach-card.locked { opacity: 0.5; }

.ach-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-base);
  flex-shrink: 0;
}

.ach-card.unlocked .ach-icon { color: var(--terracotta-deep); }
.ach-card.locked .ach-icon { color: var(--charcoal-soft); }

.ach-info { flex: 1; min-width: 0; }
.ach-name { font-size: var(--text-sm); color: var(--charcoal); font-weight: 700; margin-bottom: 4px; }
.ach-desc { font-size: var(--text-xs); color: var(--charcoal-soft); margin-bottom: 6px; }

.ach-meta {
  display: flex;
  gap: 12px;
  font-size: var(--text-2xs);
}

.ach-tp { color: var(--gold-deep); font-weight: 700; }
.ach-date { color: var(--charcoal-soft); opacity: 0.8; }

.ach-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.page-info { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); }

.season-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--terracotta);
  background: rgba(168, 188, 203, 0.2);
  border-radius: 10px;
  font-size: var(--text-xs);
}

.season-banner-title { color: var(--terracotta-deep); letter-spacing: 1px; font-weight: 700; }
.season-banner-end { color: var(--charcoal-soft); }

.seasonal-btn { letter-spacing: 1px; }

.ach-card.season-active { border-color: var(--terracotta); box-shadow: 0 0 0 1px rgba(168, 188, 203, 0.4) inset; }
.ach-card.season-archived { border-style: dashed; opacity: 0.7; }

.season-pill {
  margin-left: 6px;
  padding: 2px 8px;
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  border: 1px solid rgba(111, 138, 161, 0.35);
  background: rgba(111, 138, 161, 0.18);
  color: var(--terracotta-deep);
  border-radius: 999px;
}

.season-pill.archived { border-color: rgba(79, 74, 72, 0.16); background: rgba(79, 74, 72, 0.07); color: var(--charcoal-soft); }
</style>
