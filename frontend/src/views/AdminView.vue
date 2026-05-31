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
const seasonFormSuccess = ref('')
const seasonFormSubmitting = ref(false)

// User id whose active-state toggle is in flight, so the row's button can show
// pending state and block double-submits without freezing the whole list.
const togglingUserId = ref<string | null>(null)

const teacherForm = ref({ email: '', password: '', player_name: '' })
const teacherFormError = ref('')
const teacherFormSuccess = ref('')
const teacherFormSubmitting = ref(false)

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

const filteredSeasons = computed(() =>
  seasons.value.filter(s => matchesSearch(s.name) || matchesSearch(s.season_id))
)

// Abort the in-flight load when a newer tab switch supersedes it, so a slow
// earlier response can't overwrite the current tab's data or flip `loading`
// off underneath the request that actually owns the view.
let loadController: AbortController | null = null

async function loadData(): Promise<void> {
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  error.value = ''
  try {
    if (activeTab.value === 'teachers') {
      teachers.value = await adminService.getTeachers(controller.signal)
    } else if (activeTab.value === 'classes') {
      classes.value = await adminService.getClasses(controller.signal)
    } else if (activeTab.value === 'seasons') {
      seasons.value = await seasonService.listAdmin(controller.signal)
    } else {
      students.value = await adminService.getStudents(controller.signal)
    }
  } catch (e) {
    // A superseded load was aborted by a newer switch — expected; let the
    // newer request own `loading` and the error surface.
    if (controller.signal.aborted) return
    error.value = e instanceof Error ? e.message : 'Failed to load data'
  } finally {
    if (loadController === controller) loading.value = false
  }
}

async function submitTeacher(): Promise<void> {
  teacherFormError.value = ''
  teacherFormSuccess.value = ''
  const email = teacherForm.value.email.trim()
  const playerName = teacherForm.value.player_name.trim()
  const password = teacherForm.value.password
  if (!email || !password || !playerName) {
    teacherFormError.value = 'All fields required'
    return
  }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    teacherFormError.value = 'Password must be ≥8 characters with letters and digits'
    return
  }
  teacherFormSubmitting.value = true
  try {
    const created = await adminService.createTeacher({
      email,
      password,
      player_name: playerName,
    })
    teacherForm.value = { email: '', password: '', player_name: '' }
    teacherFormSuccess.value = `Created teacher ${created.player_name} (${created.email})`
    await loadData()
  } catch (e) {
    teacherFormError.value = e instanceof Error ? e.message : 'Failed to create teacher'
  } finally {
    teacherFormSubmitting.value = false
  }
}

async function submitSeason(): Promise<void> {
  seasonFormError.value = ''
  seasonFormSuccess.value = ''
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
    const saved = await seasonService.create({
      season_id: seasonForm.value.season_id,
      name: seasonForm.value.name,
      starts_at: new Date(seasonForm.value.starts_at).toISOString(),
      ends_at: new Date(seasonForm.value.ends_at).toISOString(),
    })
    seasonForm.value = { season_id: '', name: '', starts_at: '', ends_at: '' }
    seasonFormSuccess.value = `Saved season ${saved.name} (${saved.season_id})`
    await loadData()
  } catch (e) {
    seasonFormError.value = e instanceof Error ? e.message : 'Failed to create season'
  } finally {
    seasonFormSubmitting.value = false
  }
}

async function toggleActive(user: UserSummary): Promise<void> {
  togglingUserId.value = user.id
  error.value = ''
  try {
    const updated = await adminService.setUserActive(user.id, !user.is_active)
    user.is_active = updated.is_active
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update account status'
  } finally {
    togglingUserId.value = null
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
      <section v-if="activeTab === 'teachers' && !loading" class="teachers-section">
        <form class="season-form" @submit.prevent="submitTeacher">
          <h3 class="season-form-title">Create Teacher Account</h3>
          <input
            v-model="teacherForm.email"
            class="rune-input"
            type="email"
            autocomplete="off"
            placeholder="teacher@example.com"
          />
          <input
            v-model="teacherForm.player_name"
            class="rune-input"
            type="text"
            autocomplete="off"
            placeholder="Display name"
          />
          <input
            v-model="teacherForm.password"
            class="rune-input"
            type="password"
            autocomplete="new-password"
            placeholder="Initial password (≥8 chars, letters + digits)"
          />
          <div v-if="teacherFormError" class="error-msg">{{ teacherFormError }}</div>
          <div v-if="teacherFormSuccess" class="success-msg">{{ teacherFormSuccess }}</div>
          <button class="btn" type="submit" :disabled="teacherFormSubmitting">
            {{ teacherFormSubmitting ? 'Creating…' : 'Create Teacher' }}
          </button>
        </form>

        <ul class="item-list">
          <li
            v-for="t in filteredTeachers"
            :key="t.id"
            class="item-row user-row"
            :class="{ inactive: !t.is_active }"
          >
            <span class="item-name">{{ t.player_name }}</span>
            <span class="item-detail">{{ t.email }}</span>
            <span
              class="class-count"
              :title="`Teaches ${t.classes_joined_count} class(es) — disabling locks this teacher out of them`"
            >{{ t.classes_joined_count }} taught</span>
            <span v-if="!t.is_active" class="status-pill disabled">DISABLED</span>
            <button
              class="toggle-btn"
              :disabled="togglingUserId === t.id"
              @click="toggleActive(t)"
            >
              {{ togglingUserId === t.id ? '…' : (t.is_active ? 'Disable' : 'Enable') }}
            </button>
          </li>
          <li v-if="filteredTeachers.length === 0" class="empty">
            {{ searchQuery ? 'No results' : 'No teachers' }}
          </li>
        </ul>
      </section>

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
        <li
          v-for="s in filteredStudents"
          :key="s.id"
          class="item-row user-row"
          :class="{ inactive: !s.is_active }"
        >
          <span class="item-name">{{ s.player_name }}</span>
          <span class="item-detail">{{ s.email }}</span>
          <span
            class="class-count"
            :title="`Enrolled in ${s.classes_joined_count} class(es)`"
          >{{ s.classes_joined_count }} joined</span>
          <span v-if="!s.is_active" class="status-pill disabled">DISABLED</span>
          <button
            class="toggle-btn"
            :disabled="togglingUserId === s.id"
            @click="toggleActive(s)"
          >
            {{ togglingUserId === s.id ? '…' : (s.is_active ? 'Disable' : 'Enable') }}
          </button>
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
          <div v-if="seasonFormSuccess" class="success-msg">{{ seasonFormSuccess }}</div>
          <button class="btn" type="submit" :disabled="seasonFormSubmitting">
            {{ seasonFormSubmitting ? 'Saving…' : 'Save Season' }}
          </button>
        </form>

        <ul class="item-list">
          <li v-for="s in filteredSeasons" :key="s.season_id" class="item-row season-row">
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
              <span
                v-else
                class="season-inert"
                title="No achievements reference this season_id yet, so the 2x reward window currently grants nothing."
              > · no achievements (inert)</span>
            </div>
          </li>
          <li v-if="filteredSeasons.length === 0" class="empty">
            {{ searchQuery ? 'No results' : 'No seasons' }}
          </li>
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
  width: 720px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.admin-title {
  font-size: var(--text-lg);
  /* Mono title kept after Phase 1 swapped --font-main to system-ui. */
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  text-align: center;
}

.tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }

.tab-btn {
  flex: 1;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 10px 6px;
  min-height: 44px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--charcoal-soft);
  cursor: pointer;
}

.tab-btn.active { border-bottom-color: var(--terracotta); color: var(--terracotta-deep); font-weight: 600; }
.tab-btn:hover { color: var(--terracotta-deep); }

.item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.item-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}

.item-name { color: var(--charcoal); font-weight: 600; }
.item-detail { color: var(--charcoal-soft); opacity: 0.85; font-size: var(--text-xs); }

/* User rows carry an active-state toggle on the right; let the email column
   absorb the slack so the button stays flush-right and the row stays centered. */
.user-row { align-items: center; gap: 10px; }
.user-row .item-detail { flex: 1; }
.item-row.inactive { opacity: 0.55; }

.status-pill {
  padding: 2px 8px;
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  border-radius: 999px;
  border: 1px solid rgba(180, 96, 96, 0.32);
  background: rgba(180, 96, 96, 0.15);
  color: var(--clay-deep);
}

/* Class-count hint on user rows — gives the admin visibility into how many
   classes a teacher/student is tied to before disabling the account. */
.class-count {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
  letter-spacing: 1px;
  color: var(--charcoal-soft);
  opacity: 0.75;
  white-space: nowrap;
}

.toggle-btn {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  letter-spacing: 1px;
  padding: 6px 12px;
  min-height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(245, 250, 254, 0.6);
  color: var(--charcoal-soft);
  cursor: pointer;
}

.toggle-btn:hover:not(:disabled) { color: var(--charcoal); background: rgba(245, 250, 254, 0.9); }
.toggle-btn:disabled { opacity: 0.5; cursor: default; }

.search-input { font-size: var(--text-xs); }
.error-msg { font-size: var(--text-xs); color: var(--clay-deep); }
.loading, .empty { font-size: var(--text-sm); color: var(--charcoal-soft); font-style: italic; }

.back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--line);
  color: var(--charcoal-soft);
}

.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.seasons-section,
.teachers-section { display: flex; flex-direction: column; gap: 12px; }

.success-msg { font-size: var(--text-xs); color: var(--sage-deep); }

.season-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.season-form-title { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); letter-spacing: 2px; text-transform: uppercase; margin: 0 0 4px; }
.season-label { font-size: var(--text-xs); color: var(--charcoal-soft); display: flex; flex-direction: column; gap: 2px; }
.season-row { flex-direction: column; gap: 4px; align-items: flex-start; }

.season-id-hint { font-size: var(--text-xs); color: var(--charcoal-soft); opacity: 0.7; }

/* Inert-season warning: a season whose season_id matches no achievement grants
   nothing. Flag it so the admin notices, rather than hiding the (zero) count. */
.season-inert { color: var(--clay-deep); font-weight: 600; }

.season-pill {
  margin-left: 6px;
  padding: 2px 8px;
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  border: 1px solid rgba(126, 144, 119, 0.32);
  background: rgba(126, 144, 119, 0.18);
  color: var(--sage-deep);
  border-radius: 999px;
}

.season-pill.archived { border-color: rgba(79, 74, 72, 0.16); background: rgba(79, 74, 72, 0.07); color: var(--charcoal-soft); }
.season-pill.upcoming { border-color: rgba(107, 127, 148, 0.32); background: rgba(107, 127, 148, 0.18); color: var(--slate-deep); }
</style>
