<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { adminService, type UserSummary, type ClassSummary } from '@/services/adminService'
import { seasonService, type SeasonOut } from '@/services/seasonService'

const router = useRouter()
const route = useRoute()

const teachers = ref<UserSummary[]>([])
const students = ref<UserSummary[]>([])
const classes = ref<ClassSummary[]>([])
const seasons = ref<SeasonOut[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')

type Tab = 'teachers' | 'classes' | 'students' | 'seasons'
const activeTab = computed<Tab>(() => {
  const name = route.name as string | undefined
  if (name === 'admin-classes') return 'classes'
  if (name === 'admin-students') return 'students'
  if (name === 'admin-seasons') return 'seasons'
  return 'teachers'
})

const seasonForm = ref({ season_id: '', name: '', starts_at: '', ends_at: '' })
const seasonFormError = ref('')
const seasonFormSubmitting = ref(false)

function matchesSearch(text: string): boolean {
  if (!searchQuery.value) return true
  return text.toLowerCase().includes(searchQuery.value.toLowerCase())
}

const filteredTeachers = computed(() =>
  teachers.value.filter(t => matchesSearch(t.player_name) || matchesSearch(t.email))
)

const filteredClasses = computed(() =>
  classes.value.filter(c => matchesSearch(c.name) || matchesSearch(c.join_code))
)

const filteredStudents = computed(() =>
  students.value.filter(s => matchesSearch(s.player_name) || matchesSearch(s.email))
)

async function loadData(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (activeTab.value === 'teachers') {
      teachers.value = await adminService.getTeachers()
    } else if (activeTab.value === 'classes') {
      classes.value = await adminService.getClasses()
    } else if (activeTab.value === 'seasons') {
      seasons.value = await seasonService.listAdmin()
    } else {
      students.value = await adminService.getStudents()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load data'
  } finally {
    loading.value = false
  }
}

async function submitSeason(): Promise<void> {
  seasonFormError.value = ''
  if (!seasonForm.value.season_id || !seasonForm.value.name
      || !seasonForm.value.starts_at || !seasonForm.value.ends_at) {
    seasonFormError.value = 'All fields required'
    return
  }
  if (seasonForm.value.ends_at <= seasonForm.value.starts_at) {
    seasonFormError.value = 'ends_at must be after starts_at'
    return
  }
  seasonFormSubmitting.value = true
  try {
    await seasonService.create({
      season_id: seasonForm.value.season_id,
      name: seasonForm.value.name,
      starts_at: new Date(seasonForm.value.starts_at).toISOString(),
      ends_at: new Date(seasonForm.value.ends_at).toISOString(),
    })
    seasonForm.value = { season_id: '', name: '', starts_at: '', ends_at: '' }
    await loadData()
  } catch (e) {
    seasonFormError.value = e instanceof Error ? e.message : 'Failed to create season'
  } finally {
    seasonFormSubmitting.value = false
  }
}

function switchTab(tab: Tab): void {
  searchQuery.value = ''
  router.push({ name: `admin-${tab}` })
}

// Load whenever the active tab changes (and once on mount). activeTab is a
// computed off route.name, so this fires only after the route push settles —
// avoids loading the previous tab's data.
watch(activeTab, loadData, { immediate: true })
</script>

<template>
  <div class="admin-view">
    <div class="admin-panel rune-panel">
      <h2 class="admin-title">Admin Panel</h2>

      <div class="tab-bar">
        <button
          v-for="tab in (['teachers', 'classes', 'students', 'seasons'] as Tab[])"
          :key="tab"
          class="tab-btn"
          :class="{ active: activeTab === tab }"
          :disabled="loading"
          @click="switchTab(tab)"
        >
          {{ { teachers: 'Teachers', classes: 'Classes', students: 'Students', seasons: 'Seasons' }[tab] }}
        </button>
      </div>

      <input
        v-model="searchQuery"
        class="rune-input search-input"
        type="text"
        aria-label="Search teachers, classes, or students by name or email"
        placeholder="Search by name or email…"
      />

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-if="loading" class="loading">Loading…</div>

      <!-- Teachers -->
      <ul v-if="activeTab === 'teachers' && !loading" class="item-list">
        <li v-for="t in filteredTeachers" :key="t.id" class="item-row">
          <span class="item-name">{{ t.player_name }}</span>
          <span class="item-detail">{{ t.email }}</span>
        </li>
        <li v-if="filteredTeachers.length === 0" class="empty">
          {{ searchQuery ? 'No results' : 'No teachers' }}
        </li>
      </ul>

      <!-- Classes -->
      <ul v-if="activeTab === 'classes' && !loading" class="item-list">
        <li v-for="c in filteredClasses" :key="c.id" class="item-row">
          <span class="item-name">{{ c.name }}</span>
          <span class="item-detail">{{ c.join_code }}</span>
        </li>
        <li v-if="filteredClasses.length === 0" class="empty">
          {{ searchQuery ? 'No results' : 'No classes' }}
        </li>
      </ul>

      <!-- Students -->
      <ul v-if="activeTab === 'students' && !loading" class="item-list">
        <li v-for="s in filteredStudents" :key="s.id" class="item-row">
          <span class="item-name">{{ s.player_name }}</span>
          <span class="item-detail">{{ s.email }}</span>
        </li>
        <li v-if="filteredStudents.length === 0" class="empty">
          {{ searchQuery ? 'No results' : 'No students' }}
        </li>
      </ul>

      <!-- Seasons -->
      <section v-if="activeTab === 'seasons' && !loading" class="seasons-section">
        <form class="season-form" @submit.prevent="submitSeason">
          <h3 class="season-form-title">Create / Update Season</h3>
          <input v-model="seasonForm.season_id" class="rune-input" placeholder="season_id (e.g. spring_2026)" />
          <input v-model="seasonForm.name" class="rune-input" placeholder="display name" />
          <label class="season-label">Start <input v-model="seasonForm.starts_at" class="rune-input" type="datetime-local" /></label>
          <label class="season-label">End <input v-model="seasonForm.ends_at" class="rune-input" type="datetime-local" /></label>
          <div v-if="seasonFormError" class="error-msg">{{ seasonFormError }}</div>
          <button class="btn" type="submit" :disabled="seasonFormSubmitting">
            {{ seasonFormSubmitting ? 'Saving…' : 'Save Season' }}
          </button>
        </form>

        <ul class="item-list">
          <li v-for="s in seasons" :key="s.season_id" class="item-row season-row">
            <div>
              <span class="item-name">{{ s.name }}</span>
              <span class="season-id-hint"> · {{ s.season_id }}</span>
              <span v-if="s.active" class="season-pill">ACTIVE</span>
              <span v-else-if="s.archived" class="season-pill archived">ARCHIVED</span>
              <span v-else class="season-pill upcoming">UPCOMING</span>
            </div>
            <div class="item-detail">
              {{ s.starts_at ? new Date(s.starts_at).toLocaleDateString() : '—' }}
              →
              {{ s.ends_at ? new Date(s.ends_at).toLocaleDateString() : '—' }}
              <span v-if="s.achievement_ids.length"> · {{ s.achievement_ids.length }} achievements</span>
            </div>
          </li>
          <li v-if="seasons.length === 0" class="empty">No seasons</li>
        </ul>
      </section>

      <button class="btn back-btn" @click="router.push('/')">← Back to Menu</button>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: 40px;
}

.admin-panel {
  width: 480px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.admin-title {
  font-size: var(--text-base);
  /* Rune-themed title: keep mono after Phase 1 swapped --font-main to system-ui. */
  font-family: var(--font-mono);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 4px;
  text-align: center;
}

.tab-bar { display: flex; gap: 4px; }

.tab-btn {
  flex: 1;
  font-size: var(--text-xs);
  padding: 6px;
  min-height: 44px;
  background: none;
  border: 1px solid var(--axis);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  cursor: pointer;
}

.tab-btn.active { border-color: var(--gold); color: var(--gold); text-shadow: var(--gold-shadow); }
.tab-btn:hover { background: var(--axis); color: var(--stone-dark); }

.item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.item-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  padding: 6px;
  border: 1px solid var(--axis);
}

.item-name { color: var(--gold); text-shadow: var(--gold-shadow); }
.item-detail { color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; font-size: var(--text-xs); }

.search-input { font-size: var(--text-xs); }
.error-msg { font-size: var(--text-xs); color: var(--enemy-red); }
.loading, .empty { font-size: var(--text-sm); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.5; }

.back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }

.seasons-section { display: flex; flex-direction: column; gap: 12px; }

.season-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--axis);
}

.season-form-title { font-size: var(--text-xs); color: var(--gold); text-shadow: var(--gold-shadow); letter-spacing: 2px; margin: 0 0 4px; }
.season-label { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); display: flex; flex-direction: column; gap: 2px; }
.season-row { flex-direction: column; gap: 4px; align-items: flex-start; }

.season-id-hint { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.6; }

.season-pill {
  margin-left: 6px;
  padding: 1px 6px;
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  border: 1px solid var(--gold);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  border-radius: 2px;
}

.season-pill.archived { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.season-pill.upcoming { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.7; }
</style>
