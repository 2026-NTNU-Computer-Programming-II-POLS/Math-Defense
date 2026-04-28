<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { classService, type ClassInfo, type Membership } from '@/services/classService'

const router = useRouter()
const auth = useAuthStore()

const classes = ref<ClassInfo[]>([])
const loading = ref(false)
const error = ref('')

const newClassName = ref('')
const joinCode = ref('')

const selectedClassId = ref<string | null>(null)
const students = ref<Membership[]>([])
const newStudentId = ref('')

const isTeacherOrAdmin = computed(() => auth.isTeacher || auth.isAdmin)

async function loadClasses(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    classes.value = await classService.listClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load classes'
  } finally {
    loading.value = false
  }
}

async function createClass(): Promise<void> {
  if (!newClassName.value.trim()) return
  error.value = ''
  try {
    await classService.createClass(newClassName.value.trim())
    newClassName.value = ''
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create class'
  }
}

async function joinClass(): Promise<void> {
  if (!joinCode.value.trim()) return
  error.value = ''
  try {
    await classService.joinByCode(joinCode.value.trim())
    joinCode.value = ''
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to join class'
  }
}

async function selectClass(id: string): Promise<void> {
  selectedClassId.value = id
  try {
    students.value = await classService.listStudents(id)
  } catch {
    students.value = []
  }
}

async function addStudent(): Promise<void> {
  if (!selectedClassId.value || !newStudentId.value.trim()) return
  error.value = ''
  try {
    await classService.addStudent(selectedClassId.value, newStudentId.value.trim())
    newStudentId.value = ''
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add student'
  }
}

async function removeStudent(studentId: string): Promise<void> {
  if (!selectedClassId.value) return
  try {
    await classService.removeStudent(selectedClassId.value, studentId)
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove student'
  }
}

async function regenerateCode(classId: string): Promise<void> {
  try {
    const res = await classService.regenerateCode(classId)
    const idx = classes.value.findIndex((c) => c.id === classId)
    if (idx !== -1) classes.value[idx].join_code = res.join_code
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to regenerate code'
  }
}

function copyCode(code: string): void {
  navigator.clipboard.writeText(code).catch(() => {})
}

onMounted(loadClasses)
</script>

<template>
  <div class="class-view">
    <div class="class-panel rune-panel">
      <h2 class="class-title">班級管理</h2>

      <div v-if="error" class="class-error">{{ error }}</div>

      <!-- Teacher: create class -->
      <div v-if="isTeacherOrAdmin" class="section">
        <h3 class="section-title">建立班級</h3>
        <form class="inline-form" @submit.prevent="createClass">
          <input v-model="newClassName" class="rune-input" type="text" placeholder="班級名稱" />
          <button class="btn" type="submit">建立</button>
        </form>
      </div>

      <!-- Student: join class -->
      <div v-if="auth.isStudent" class="section">
        <h3 class="section-title">加入班級</h3>
        <form class="inline-form" @submit.prevent="joinClass">
          <input v-model="joinCode" class="rune-input" type="text" placeholder="加入代碼" />
          <button class="btn" type="submit">加入</button>
        </form>
      </div>

      <!-- Class list -->
      <div class="section">
        <h3 class="section-title">我的班級</h3>
        <div v-if="loading" class="loading">載入中…</div>
        <div v-else-if="classes.length === 0" class="empty">尚無班級</div>
        <ul v-else class="class-list">
          <li
            v-for="c in classes"
            :key="c.id"
            class="class-item"
            :class="{ selected: selectedClassId === c.id }"
          >
            <div class="class-item-header" @click="isTeacherOrAdmin ? selectClass(c.id) : undefined">
              <span class="class-name">{{ c.name }}</span>
              <span v-if="c.join_code" class="join-code" @click.stop="copyCode(c.join_code!)">
                {{ c.join_code }}
              </span>
            </div>
            <div v-if="isTeacherOrAdmin && c.join_code" class="class-actions">
              <button class="btn-sm" @click="regenerateCode(c.id)">重新產生代碼</button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Students in selected class (teacher view) -->
      <div v-if="isTeacherOrAdmin && selectedClassId" class="section">
        <h3 class="section-title">班級學生</h3>
        <form class="inline-form" @submit.prevent="addStudent">
          <input v-model="newStudentId" class="rune-input" type="text" placeholder="學生 ID" />
          <button class="btn" type="submit">加入</button>
        </form>
        <ul v-if="students.length > 0" class="student-list">
          <li v-for="s in students" :key="s.id" class="student-item">
            <span>{{ s.student_id }}</span>
            <button class="btn-sm danger" @click="removeStudent(s.student_id)">移除</button>
          </li>
        </ul>
        <div v-else class="empty">尚無學生</div>
      </div>

      <button class="btn back-btn" @click="router.push('/')">← 返回主選單</button>
    </div>
  </div>
</template>

<style scoped>
.class-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.class-panel {
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.class-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
  text-align: center;
}

.class-error { font-size: 11px; color: var(--enemy-red); }

.section { display: flex; flex-direction: column; gap: 8px; }
.section-title { font-size: 12px; color: var(--gold); margin: 0; }

.inline-form { display: flex; gap: 8px; }
.inline-form .rune-input { flex: 1; }

.class-list, .student-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }

.class-item {
  border: 1px solid var(--axis);
  padding: 8px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.class-item.selected { border-color: var(--gold); }

.class-item-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
}

.class-name { color: var(--gold); }

.join-code {
  font-family: monospace;
  color: var(--axis);
  cursor: pointer;
  font-size: 10px;
}

.join-code:hover { color: var(--gold); }

.class-actions { display: flex; gap: 4px; }

.student-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--axis);
}

.btn-sm {
  font-size: 9px;
  padding: 2px 6px;
  background: none;
  border: 1px solid var(--axis);
  color: var(--axis);
  cursor: pointer;
}

.btn-sm:hover { background: var(--axis); color: var(--stone-dark); }
.btn-sm.danger { border-color: var(--enemy-red); color: var(--enemy-red); }
.btn-sm.danger:hover { background: var(--enemy-red); color: var(--stone-dark); }

.loading, .empty { font-size: 11px; color: var(--axis); opacity: 0.5; }

.back-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
