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
      <button class="btn" @click="router.push('/profile')">← Back</button>
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
            <span class="ach-tp">+{{ a.season_active ? a.talent_points * 2 : a.talent_points }} TP</span>
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
  max-width: 800px;
  margin: 0 auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-y: auto;
}

.ach-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.ach-title {
  font-size: 20px;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 4px;
}

.ach-summary {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.ach-count { color: var(--gold); text-shadow: var(--gold-shadow); }
.ach-points { color: var(--axis); text-shadow: var(--gold-shadow); }

.ach-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-btn.active { background: var(--gold); color: var(--stone-dark); }

.ach-loading, .ach-error { text-align: center; color: var(--axis); text-shadow: var(--gold-shadow); padding: 32px; }
.ach-error { color: var(--enemy-red); }

.ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ach-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  transition: border-color 0.2s;
}

.ach-card.unlocked {
  border-color: var(--gold);
  background: var(--gold-tint-faint);
}

.ach-card.locked { opacity: 0.5; }

.ach-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.ach-card.unlocked .ach-icon { color: var(--gold); text-shadow: var(--gold-shadow); }
.ach-card.locked .ach-icon { color: var(--axis); text-shadow: var(--gold-shadow); }

.ach-info { flex: 1; min-width: 0; }
.ach-name { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.ach-desc { font-size: 10px; color: var(--axis); text-shadow: var(--gold-shadow); margin-bottom: 6px; }

.ach-meta {
  display: flex;
  gap: 12px;
  font-size: 10px;
}

.ach-tp { color: var(--gold); text-shadow: var(--gold-shadow); }
.ach-date { color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; }

.ach-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.page-info { font-size: 11px; color: var(--axis); text-shadow: var(--gold-shadow); }

.season-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--gold);
  background: var(--gold-tint);
  border-radius: 4px;
  font-size: 11px;
}

.season-banner-title { color: var(--gold); text-shadow: var(--gold-shadow); letter-spacing: 1px; }
.season-banner-end { color: var(--axis); text-shadow: var(--gold-shadow); }

.seasonal-btn { letter-spacing: 1px; }

.ach-card.season-active { border-color: var(--gold); box-shadow: 0 0 0 1px rgba(212, 160, 23, 0.4) inset; }
.ach-card.season-archived { border-style: dashed; opacity: 0.7; }

.season-pill {
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 9px;
  letter-spacing: 1px;
  border: 1px solid var(--gold);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  border-radius: 2px;
}

.season-pill.archived { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
</style>
