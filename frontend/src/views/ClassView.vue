<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { classService, type ClassInfo, type Membership } from '@/services/classService'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const classes = ref<ClassInfo[]>([])
const loading = ref(false)
const error = ref('')

const newClassName = ref('')
const joinCode = ref('')

const selectedClassId = ref<string | null>(null)
const students = ref<Membership[]>([])
const newStudentEmail = ref('')

const creatingClass = ref(false)
const joiningClass = ref(false)
const addingStudent = ref(false)
const regeneratingId = ref<string | null>(null)
const studentsLoading = ref(false)
const studentsError = ref('')
const copiedCode = ref<string | null>(null)

const renamingClassId = ref<string | null>(null)
const renameNameDraft = ref('')
const renameSaving = ref(false)
const deletingClassId = ref<string | null>(null)

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
  if (!newClassName.value.trim()) {
    error.value = 'Please enter a class name'
    return
  }
  if (creatingClass.value) return
  error.value = ''
  creatingClass.value = true
  try {
    await classService.createClass(newClassName.value.trim())
    newClassName.value = ''
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create class'
  } finally {
    creatingClass.value = false
  }
}

async function joinClass(): Promise<void> {
  if (!joinCode.value.trim()) {
    error.value = 'Please enter a join code'
    return
  }
  if (joiningClass.value) return
  error.value = ''
  joiningClass.value = true
  try {
    await classService.joinByCode(joinCode.value.trim())
    joinCode.value = ''
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to join class'
  } finally {
    joiningClass.value = false
  }
}

async function selectClass(id: string): Promise<void> {
  selectedClassId.value = id
  studentsLoading.value = true
  studentsError.value = ''
  try {
    students.value = await classService.listStudents(id)
  } catch (e) {
    studentsError.value = e instanceof Error ? e.message : 'Failed to load students'
    students.value = []
  } finally {
    studentsLoading.value = false
  }
}

async function addStudent(): Promise<void> {
  if (!selectedClassId.value || !newStudentEmail.value.trim()) {
    error.value = 'Please enter a student email'
    return
  }
  if (addingStudent.value) return
  error.value = ''
  addingStudent.value = true
  try {
    await classService.addStudent(selectedClassId.value, newStudentEmail.value.trim())
    newStudentEmail.value = ''
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add student'
  } finally {
    addingStudent.value = false
  }
}

async function removeStudent(studentId: string, displayName: string): Promise<void> {
  if (!selectedClassId.value) return
  if (!confirm(`Remove student "${displayName}"?`)) return
  try {
    await classService.removeStudent(selectedClassId.value, studentId)
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove student'
  }
}

async function regenerateCode(classId: string): Promise<void> {
  if (regeneratingId.value) return
  if (!confirm('Regenerate join code? The current code will stop working.')) return
  regeneratingId.value = classId
  try {
    const res = await classService.regenerateCode(classId)
    const idx = classes.value.findIndex((c) => c.id === classId)
    if (idx !== -1) classes.value[idx].join_code = res.join_code
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to regenerate code'
  } finally {
    regeneratingId.value = null
  }
}

function copyCode(code: string): void {
  const markCopied = () => {
    copiedCode.value = code
    setTimeout(() => { copiedCode.value = null }, 2000)
  }
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = code
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try { document.execCommand('copy'); markCopied() } catch { error.value = 'Failed to copy code' }
    document.body.removeChild(ta)
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(markCopied).catch(fallback)
  } else {
    fallback()
  }
}

function startRename(c: ClassInfo): void {
  renamingClassId.value = c.id
  renameNameDraft.value = c.name
}

function cancelRename(): void {
  renamingClassId.value = null
  renameNameDraft.value = ''
}

async function saveRename(classId: string): Promise<void> {
  if (!renameNameDraft.value.trim() || renameSaving.value) return
  renameSaving.value = true
  error.value = ''
  try {
    await classService.renameClass(classId, renameNameDraft.value.trim())
    await loadClasses()
    cancelRename()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to rename class'
  } finally {
    renameSaving.value = false
  }
}

async function deleteClass(classId: string, className: string): Promise<void> {
  if (deletingClassId.value) return
  if (!confirm(`Delete class "${className}"? This cannot be undone.`)) return
  deletingClassId.value = classId
  error.value = ''
  try {
    await classService.deleteClass(classId)
    if (selectedClassId.value === classId) {
      selectedClassId.value = null
      students.value = []
    }
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete class'
  } finally {
    deletingClassId.value = null
  }
}

onMounted(async () => {
  await loadClasses()
  const preselect = route.query.select as string | undefined
  if (preselect && isTeacherOrAdmin.value) {
    if (classes.value.some((c) => c.id === preselect)) {
      await selectClass(preselect)
    }
  }
})
</script>

<template>
  <div class="class-view">
    <div class="class-panel rune-panel">
      <h2 class="class-title">Class Management</h2>

      <div v-if="error" class="class-error">{{ error }}</div>

      <!-- Teacher: create class -->
      <div v-if="isTeacherOrAdmin" class="section">
        <h3 class="section-title">Create Class</h3>
        <form class="inline-form" @submit.prevent="createClass">
          <input v-model="newClassName" class="rune-input" type="text" placeholder="Class name" />
          <button class="btn" type="submit" :disabled="creatingClass">
            {{ creatingClass ? 'Creating…' : 'Create' }}
          </button>
        </form>
      </div>

      <!-- Student: join class -->
      <div v-if="auth.isStudent" class="section">
        <h3 class="section-title">Join Class</h3>
        <form class="inline-form" @submit.prevent="joinClass">
          <input v-model="joinCode" class="rune-input" type="text" placeholder="Join code" />
          <button class="btn" type="submit" :disabled="joiningClass">
            {{ joiningClass ? 'Joining…' : 'Join' }}
          </button>
        </form>
      </div>

      <!-- Class list -->
      <div class="section">
        <h3 class="section-title">My Classes</h3>
        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="classes.length === 0" class="empty">No classes yet</div>
        <ul v-else class="class-list">
          <li
            v-for="c in classes"
            :key="c.id"
            class="class-item"
            :class="{ selected: selectedClassId === c.id }"
          >
            <div class="class-item-header" @click="isTeacherOrAdmin ? selectClass(c.id) : undefined">
              <template v-if="renamingClassId === c.id">
                <input
                  v-model="renameNameDraft"
                  class="rune-input rename-input"
                  type="text"
                  @click.stop
                  @keyup.enter="saveRename(c.id)"
                  @keyup.escape="cancelRename"
                />
                <div class="rename-btns" @click.stop>
                  <button class="btn-sm" :disabled="renameSaving" @click="saveRename(c.id)">✓</button>
                  <button class="btn-sm" @click="cancelRename">✕</button>
                </div>
              </template>
              <template v-else>
                <span class="class-name">{{ c.name }}</span>
                <span v-if="c.teacher_player_name && !isTeacherOrAdmin" class="teacher-name">{{ c.teacher_player_name }}</span>
                <span
                  v-if="c.join_code"
                  class="join-code"
                  :class="{ copied: copiedCode === c.join_code }"
                  :title="copiedCode === c.join_code ? 'Copied!' : 'Click to copy'"
                  @click.stop="copyCode(c.join_code!)"
                >
                  {{ copiedCode === c.join_code ? '✓ Copied' : c.join_code }}
                </span>
              </template>
            </div>
            <div v-if="isTeacherOrAdmin" class="class-actions">
              <button
                class="btn-sm"
                :disabled="regeneratingId === c.id"
                @click="regenerateCode(c.id)"
              >
                {{ regeneratingId === c.id ? 'Generating…' : 'New Code' }}
              </button>
              <button class="btn-sm" @click.stop="startRename(c)">Rename</button>
              <button
                class="btn-sm danger"
                :disabled="deletingClassId === c.id"
                @click.stop="deleteClass(c.id, c.name)"
              >
                {{ deletingClassId === c.id ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Students in selected class (teacher view) -->
      <div v-if="isTeacherOrAdmin && selectedClassId" class="section">
        <h3 class="section-title">Students</h3>
        <form class="inline-form" @submit.prevent="addStudent">
          <input v-model="newStudentEmail" class="rune-input" type="email" placeholder="Student email" />
          <button class="btn" type="submit" :disabled="addingStudent">
            {{ addingStudent ? 'Adding…' : 'Add' }}
          </button>
        </form>
        <div v-if="studentsLoading" class="loading">Loading…</div>
        <div v-else-if="studentsError" class="class-error">{{ studentsError }}</div>
        <ul v-else-if="students.length > 0" class="student-list">
          <li v-for="s in students" :key="s.id" class="student-item">
            <div class="student-info">
              <span class="student-name">{{ s.player_name || s.student_id }}</span>
              <span class="student-email">{{ s.email }}</span>
            </div>
            <button class="btn-sm danger" @click="removeStudent(s.student_id, s.player_name || s.student_id)">Remove</button>
          </li>
        </ul>
        <div v-else class="empty">No students yet</div>
      </div>

      <button class="btn back-btn" @click="router.push('/')">← Back to Menu</button>
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
  max-width: calc(100% - 32px);
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
  align-items: center;
  cursor: pointer;
  gap: 8px;
}

.class-name { color: var(--gold); flex: 1; }

.teacher-name {
  font-size: 10px;
  color: var(--axis);
  opacity: 0.6;
}

.join-code {
  font-family: monospace;
  color: var(--axis);
  cursor: pointer;
  font-size: 10px;
  transition: color 0.15s;
  white-space: nowrap;
}

.join-code:hover { color: var(--gold); }
.join-code.copied { color: var(--gold); }

.rename-input { flex: 1; font-size: 11px; }
.rename-btns { display: flex; gap: 4px; }

.class-actions { display: flex; gap: 4px; }

.student-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.student-info { display: flex; flex-direction: column; gap: 2px; }
.student-name { color: var(--gold); }
.student-email { font-size: 9px; color: var(--axis); opacity: 0.6; }

.btn-sm {
  font-size: 9px;
  padding: 2px 6px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  background: none;
  border: 1px solid var(--axis);
  color: var(--axis);
  cursor: pointer;
}

.btn-sm:hover:not(:disabled) { background: var(--axis); color: var(--stone-dark); }
.btn-sm.danger { border-color: var(--enemy-red); color: var(--enemy-red); }
.btn-sm.danger:hover { background: var(--enemy-red); color: var(--stone-dark); }
.btn-sm:disabled { opacity: 0.4; cursor: default; }

.loading, .empty { font-size: 11px; color: var(--axis); opacity: 0.5; }

.back-btn {
  font-size: 11px;
  letter-spacing: 1px;
  border-color: var(--axis);
  color: var(--axis);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
