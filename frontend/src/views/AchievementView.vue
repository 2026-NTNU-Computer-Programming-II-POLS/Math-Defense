<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { achievementService, type AchievementOut } from '@/services/achievementService'
import { ACHIEVEMENT_CATEGORIES } from '@/data/achievement-defs'

const router = useRouter()
const achievements = ref<AchievementOut[]>([])
const loading = ref(true)
const error = ref('')
const selectedCategory = ref<string | null>(null)

const filtered = computed(() => {
  if (!selectedCategory.value) return achievements.value
  return achievements.value.filter(a => a.category === selectedCategory.value)
})

const unlockedCount = computed(() => achievements.value.filter(a => a.unlocked).length)
const totalPoints = computed(() =>
  achievements.value.filter(a => a.unlocked).reduce((sum, a) => sum + a.talent_points, 0),
)

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
    </div>

    <div v-if="loading" class="ach-loading">Loading...</div>
    <div v-else-if="error" class="ach-error">{{ error }}</div>
    <div v-else class="ach-grid">
      <div
        v-for="a in filtered"
        :key="a.id"
        :class="['ach-card', { unlocked: a.unlocked, locked: !a.unlocked }]"
      >
        <div class="ach-icon">{{ a.unlocked ? '&#10003;' : '&#9679;' }}</div>
        <div class="ach-info">
          <div class="ach-name">{{ a.name }}</div>
          <div class="ach-desc">{{ a.description }}</div>
          <div class="ach-meta">
            <span class="ach-tp">+{{ a.talent_points }} TP</span>
            <span v-if="a.unlocked && a.unlocked_at" class="ach-date">
              {{ new Date(a.unlocked_at).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>
    </div>
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
  letter-spacing: 4px;
}

.ach-summary {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.ach-count { color: var(--gold); }
.ach-points { color: var(--axis); }

.ach-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-btn.active { background: var(--gold); color: var(--stone-dark); }

.ach-loading, .ach-error { text-align: center; color: var(--axis); padding: 32px; }
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
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  transition: border-color 0.2s;
}

.ach-card.unlocked {
  border-color: var(--gold);
  background: rgba(212, 168, 64, 0.05);
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

.ach-card.unlocked .ach-icon { color: var(--gold); }
.ach-card.locked .ach-icon { color: var(--axis); }

.ach-info { flex: 1; min-width: 0; }
.ach-name { font-size: 12px; color: #e8dcc8; margin-bottom: 4px; }
.ach-desc { font-size: 10px; color: var(--axis); margin-bottom: 6px; }

.ach-meta {
  display: flex;
  gap: 12px;
  font-size: 10px;
}

.ach-tp { color: var(--gold); }
.ach-date { color: var(--axis); opacity: 0.7; }
</style>
