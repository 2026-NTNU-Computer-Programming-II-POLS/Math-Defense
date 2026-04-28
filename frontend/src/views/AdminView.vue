<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { adminService, type UserSummary, type ClassSummary } from '@/services/adminService'

const router = useRouter()
const route = useRoute()

const teachers = ref<UserSummary[]>([])
const students = ref<UserSummary[]>([])
const classes = ref<ClassSummary[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')

type Tab = 'teachers' | 'classes' | 'students'
const activeTab = computed<Tab>(() => {
  const name = route.name as string | undefined
  if (name === 'admin-classes') return 'classes'
  if (name === 'admin-students') return 'students'
  return 'teachers'
})

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
    } else {
      students.value = await adminService.getStudents()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load data'
  } finally {
    loading.value = false
  }
}

function switchTab(tab: Tab): void {
  searchQuery.value = ''
  router.push({ name: `admin-${tab}` })
}

onMounted(loadData)
</script>

<template>
  <div class="admin-view">
    <div class="admin-panel rune-panel">
      <h2 class="admin-title">管理面板</h2>

      <div class="tab-bar">
        <button
          v-for="tab in (['teachers', 'classes', 'students'] as Tab[])"
          :key="tab"
          class="tab-btn"
          :class="{ active: activeTab === tab }"
          @click="switchTab(tab); loadData()"
        >
          {{ { teachers: '教師', classes: '班級', students: '學生' }[tab] }}
        </button>
      </div>

      <input
        v-model="searchQuery"
        class="rune-input search-input"
        type="text"
        placeholder="Search by name or email…"
      />

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-if="loading" class="loading">載入中…</div>

      <!-- Teachers -->
      <ul v-if="activeTab === 'teachers' && !loading" class="item-list">
        <li v-for="t in filteredTeachers" :key="t.id" class="item-row">
          <span class="item-name">{{ t.player_name }}</span>
          <span class="item-detail">{{ t.email }}</span>
        </li>
        <li v-if="filteredTeachers.length === 0" class="empty">
          {{ searchQuery ? 'No results' : '尚無教師' }}
        </li>
      </ul>

      <!-- Classes -->
      <ul v-if="activeTab === 'classes' && !loading" class="item-list">
        <li v-for="c in filteredClasses" :key="c.id" class="item-row">
          <span class="item-name">{{ c.name }}</span>
          <span class="item-detail">{{ c.join_code }}</span>
        </li>
        <li v-if="filteredClasses.length === 0" class="empty">
          {{ searchQuery ? 'No results' : '尚無班級' }}
        </li>
      </ul>

      <!-- Students -->
      <ul v-if="activeTab === 'students' && !loading" class="item-list">
        <li v-for="s in filteredStudents" :key="s.id" class="item-row">
          <span class="item-name">{{ s.player_name }}</span>
          <span class="item-detail">{{ s.email }}</span>
        </li>
        <li v-if="filteredStudents.length === 0" class="empty">
          {{ searchQuery ? 'No results' : '尚無學生' }}
        </li>
      </ul>

      <button class="btn back-btn" @click="router.push('/')">← 返回主選單</button>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.admin-panel {
  width: 480px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.admin-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
  text-align: center;
}

.tab-bar { display: flex; gap: 4px; }

.tab-btn {
  flex: 1;
  font-size: 11px;
  padding: 6px;
  background: none;
  border: 1px solid var(--axis);
  color: var(--axis);
  cursor: pointer;
}

.tab-btn.active { border-color: var(--gold); color: var(--gold); }
.tab-btn:hover { background: var(--axis); color: var(--stone-dark); }

.item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.item-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 6px;
  border: 1px solid var(--axis);
}

.item-name { color: var(--gold); }
.item-detail { color: var(--axis); opacity: 0.7; font-size: 10px; }

.search-input { font-size: 11px; }
.error-msg { font-size: 11px; color: var(--enemy-red); }
.loading, .empty { font-size: 11px; color: var(--axis); opacity: 0.5; }

.back-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
