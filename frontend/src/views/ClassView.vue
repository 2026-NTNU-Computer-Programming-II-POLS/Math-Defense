<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import {
  classService,
  type ClassInfo,
  type Membership,
  type CoTeacher,
  type PendingInvite,
  type ClassGroup,
  type GroupMember,
  type ClassLeaderboardEntry,
  type BulkAddResult,
} from '@/services/classService'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const classes = ref<ClassInfo[]>([])
const loading = ref(false)
const error = ref('')

const newClassName = ref('')
const joinCode = ref('')
const includeArchived = ref(true)

const selectedClassId = ref<string | null>(null)
const students = ref<Membership[]>([])
const newStudentEmail = ref('')
const bulkEmailsText = ref('')

const coTeachers = ref<CoTeacher[]>([])
const newCoTeacherEmail = ref('')

const invites = ref<PendingInvite[]>([])

const groups = ref<ClassGroup[]>([])
const newGroupName = ref('')
const newGroupColor = ref('')
const selectedGroupId = ref<string | null>(null)
const groupMembers = ref<GroupMember[]>([])

const leaderboard = ref<ClassLeaderboardEntry[]>([])
const showLeaderboard = ref(false)

const qrCode = ref<{ code: string; join_url: string } | null>(null)
const showQr = ref(false)
// BUG-003: track which class the open QR panel belongs to so a regenerate on
// that class can refresh the panel instead of leaving a now-invalid code shown.
const qrClassId = ref<string | null>(null)

const transferTeacherId = ref('')
const transferringClassId = ref<string | null>(null)

const creatingClass = ref(false)
const joiningClass = ref(false)
const addingStudent = ref(false)
const bulkAdding = ref(false)
const regeneratingId = ref<string | null>(null)
const archivingId = ref<string | null>(null)
const studentsLoading = ref(false)
const studentsError = ref('')
const copiedCode = ref<string | null>(null)
const bulkResult = ref<BulkAddResult | null>(null)

const renamingClassId = ref<string | null>(null)
const renameNameDraft = ref('')
const renameSaving = ref(false)
const deletingClassId = ref<string | null>(null)

const isTeacherOrAdmin = computed(() => auth.isTeacher || auth.isAdmin)
const selectedClass = computed(() =>
  selectedClassId.value
    ? classes.value.find((c) => c.id === selectedClassId.value) ?? null
    : null,
)
const selectedIsOwner = computed(() => {
  const c = selectedClass.value
  if (!c || !auth.user) return false
  return c.teacher_id === auth.user.id
})
// BUG-004/005: per-row ownership gate for owner-only actions. selectedIsOwner is
// keyed on the selected class, but the list-row action buttons live in the
// per-row loop, so ownership must be checked against the row's own class (`c`).
function isClassOwner(c: ClassInfo): boolean {
  return !!auth.user && c.teacher_id === auth.user.id
}
// BUG-005 follow-up: admin has read-only access to class management — creating a
// class and every student/group mutation is teacher-only on the backend
// (require_role(TEACHER) + _verify_teacher_write rejects ADMIN). Gate write
// controls on this so admins aren't offered actions that always 403, while they
// keep read access to rosters/reports. Co-teachers are teacher-role, so student
// management stays available to them (the backend permits it).
const canManageStudents = computed(() => auth.isTeacher)

async function loadClasses(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    classes.value = await classService.listClasses(includeArchived.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load classes'
  } finally {
    loading.value = false
  }
}

watch(includeArchived, () => { void loadClasses() })

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
  bulkResult.value = null
  showLeaderboard.value = false
  showQr.value = false
  selectedGroupId.value = null
  try {
    const [stu, co, inv, grp] = await Promise.all([
      classService.listStudents(id),
      classService.listCoTeachers(id).catch(() => [] as CoTeacher[]),
      classService.listInvites(id).catch(() => [] as PendingInvite[]),
      classService.listGroups(id).catch(() => [] as ClassGroup[]),
    ])
    students.value = stu
    coTeachers.value = co
    invites.value = inv
    groups.value = grp
  } catch (e) {
    studentsError.value = e instanceof Error ? e.message : 'Failed to load class detail'
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

async function bulkAddStudents(): Promise<void> {
  if (!selectedClassId.value) return
  const emails = bulkEmailsText.value
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (emails.length === 0) {
    error.value = 'Enter at least one email'
    return
  }
  if (bulkAdding.value) return
  error.value = ''
  bulkAdding.value = true
  try {
    bulkResult.value = await classService.bulkAddStudents(selectedClassId.value, emails)
    bulkEmailsText.value = ''
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Bulk add failed'
  } finally {
    bulkAdding.value = false
  }
}

async function removeStudent(studentId: string, displayName: string): Promise<void> {
  if (!selectedClassId.value) return
  const ok = await ui.showConfirm('Remove student', `Remove student "${displayName}"?`, { confirmLabel: 'Remove' })
  if (!ok) return
  try {
    await classService.removeStudent(selectedClassId.value, studentId)
    await selectClass(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove student'
  }
}

async function regenerateCode(classId: string): Promise<void> {
  if (regeneratingId.value) return
  const ok = await ui.showConfirm(
    'Regenerate join code',
    'Regenerate join code? Existing students remain enrolled; only the old code stops working for new joiners.',
    { confirmLabel: 'Regenerate' },
  )
  if (!ok) return
  regeneratingId.value = classId
  try {
    const res = await classService.regenerateCode(classId)
    const idx = classes.value.findIndex((c) => c.id === classId)
    if (idx !== -1) classes.value[idx].join_code = res.join_code
    // BUG-003: if the QR panel is open for this class it still shows the now-
    // invalidated code/link. Refresh it so the teacher never shares a stale QR.
    if (showQr.value && qrClassId.value === classId) await loadQr(classId)
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
  const ok = await ui.showConfirm(
    'Delete class',
    `Delete class "${className}"? This cannot be undone. Consider archiving instead.`,
    { confirmLabel: 'Delete' },
  )
  if (!ok) return
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

async function toggleArchive(c: ClassInfo): Promise<void> {
  if (archivingId.value) return
  const action = c.archived_at ? 'unarchive' : 'archive'
  const ok = await ui.showConfirm(
    action === 'archive' ? 'Archive class' : 'Unarchive class',
    action === 'archive'
      ? `Archive "${c.name}"? Students stay enrolled but new joins are blocked.`
      : `Unarchive "${c.name}"? It will accept new joins again.`,
    { confirmLabel: action === 'archive' ? 'Archive' : 'Unarchive' },
  )
  if (!ok) return
  archivingId.value = c.id
  try {
    if (action === 'archive') {
      await classService.archiveClass(c.id)
    } else {
      await classService.unarchiveClass(c.id)
    }
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : `Failed to ${action} class`
  } finally {
    archivingId.value = null
  }
}

async function transferClass(classId: string): Promise<void> {
  if (!transferTeacherId.value.trim()) {
    error.value = 'Enter the new teacher user ID'
    return
  }
  const ok = await ui.showConfirm(
    'Transfer ownership',
    `Transfer this class to teacher ID "${transferTeacherId.value}"? You will lose owner permissions.`,
    { confirmLabel: 'Transfer' },
  )
  if (!ok) return
  try {
    await classService.transferOwnership(classId, transferTeacherId.value.trim())
    transferTeacherId.value = ''
    transferringClassId.value = null
    await loadClasses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to transfer ownership'
  }
}

async function loadQr(classId: string): Promise<void> {
  try {
    qrCode.value = await classService.joinQr(classId)
    qrClassId.value = classId
    showQr.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load QR'
  }
}

async function addCoTeacher(): Promise<void> {
  if (!selectedClassId.value || !newCoTeacherEmail.value.trim()) return
  try {
    await classService.addCoTeacher(selectedClassId.value, newCoTeacherEmail.value.trim())
    newCoTeacherEmail.value = ''
    coTeachers.value = await classService.listCoTeachers(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add co-teacher'
  }
}

async function removeCoTeacher(teacherId: string): Promise<void> {
  if (!selectedClassId.value) return
  const ok = await ui.showConfirm('Remove co-teacher', 'Remove this co-teacher?', { confirmLabel: 'Remove' })
  if (!ok) return
  try {
    await classService.removeCoTeacher(selectedClassId.value, teacherId)
    coTeachers.value = await classService.listCoTeachers(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove co-teacher'
  }
}

async function revokeInvite(email: string): Promise<void> {
  if (!selectedClassId.value) return
  try {
    await classService.revokeInvite(selectedClassId.value, email)
    invites.value = await classService.listInvites(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to revoke invite'
  }
}

async function createGroup(): Promise<void> {
  if (!selectedClassId.value || !newGroupName.value.trim()) return
  try {
    await classService.createGroup(
      selectedClassId.value,
      newGroupName.value.trim(),
      newGroupColor.value.trim() || null,
    )
    newGroupName.value = ''
    newGroupColor.value = ''
    groups.value = await classService.listGroups(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create group'
  }
}

async function deleteGroup(groupId: string): Promise<void> {
  if (!selectedClassId.value) return
  const ok = await ui.showConfirm('Delete group', 'Delete this group? Members will be unassigned.', { confirmLabel: 'Delete' })
  if (!ok) return
  try {
    await classService.deleteGroup(selectedClassId.value, groupId)
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = null
      groupMembers.value = []
    }
    groups.value = await classService.listGroups(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete group'
  }
}

async function selectGroup(groupId: string): Promise<void> {
  if (!selectedClassId.value) return
  selectedGroupId.value = groupId
  try {
    groupMembers.value = await classService.listGroupMembers(selectedClassId.value, groupId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load group members'
  }
}

async function assignToGroup(studentId: string): Promise<void> {
  if (!selectedClassId.value || !selectedGroupId.value) return
  try {
    await classService.addGroupMember(selectedClassId.value, selectedGroupId.value, studentId)
    groupMembers.value = await classService.listGroupMembers(selectedClassId.value, selectedGroupId.value)
    groups.value = await classService.listGroups(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to assign student'
  }
}

async function unassignFromGroup(studentId: string): Promise<void> {
  if (!selectedClassId.value || !selectedGroupId.value) return
  try {
    await classService.removeGroupMember(selectedClassId.value, selectedGroupId.value, studentId)
    groupMembers.value = await classService.listGroupMembers(selectedClassId.value, selectedGroupId.value)
    groups.value = await classService.listGroups(selectedClassId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to unassign student'
  }
}

async function toggleLeaderboard(): Promise<void> {
  if (!selectedClassId.value) return
  if (showLeaderboard.value) {
    showLeaderboard.value = false
    return
  }
  try {
    leaderboard.value = await classService.leaderboard(selectedClassId.value)
    showLeaderboard.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load leaderboard'
  }
}

function downloadReport(): void {
  if (!selectedClassId.value) return
  window.open(classService.reportCsvUrl(selectedClassId.value), '_blank')
}

onMounted(async () => {
  // Auto-claim pending invites silently so students sent an invite before
  // signing up get their classes attached without an extra click.
  try { await classService.claimInvites() } catch { /* best effort */ }
  await loadClasses()
  const preselect = route.query.select as string | undefined
  if (preselect && isTeacherOrAdmin.value && classes.value.some((c) => c.id === preselect)) {
    await selectClass(preselect)
  }
  // Deep-link join: /classes?code=ABCD1234
  const codeFromUrl = route.query.code as string | undefined
  if (codeFromUrl && auth.isStudent) {
    joinCode.value = codeFromUrl
  }
})
</script>

<template>
  <div class="class-view">
    <div class="class-panel rune-panel">
      <h2 class="class-title">Class Management</h2>

      <div v-if="error" class="class-error">{{ error }}</div>

      <div v-if="auth.isTeacher" class="section">
        <h3 class="section-title">Create Class</h3>
        <form class="inline-form" @submit.prevent="createClass">
          <input v-model="newClassName" class="rune-input" type="text" placeholder="Class name" />
          <button class="btn" type="submit" :disabled="creatingClass">
            {{ creatingClass ? 'Creating…' : 'Create' }}
          </button>
        </form>
      </div>

      <div v-if="auth.isStudent" class="section">
        <h3 class="section-title">Join Class</h3>
        <form class="inline-form" @submit.prevent="joinClass">
          <input v-model="joinCode" class="rune-input" type="text" placeholder="Join code (8 chars)" maxlength="8" />
          <button class="btn" type="submit" :disabled="joiningClass">
            {{ joiningClass ? 'Joining…' : 'Join' }}
          </button>
        </form>
      </div>

      <div class="section">
        <div class="row-between">
          <h3 class="section-title">My Classes</h3>
          <label v-if="isTeacherOrAdmin" class="toggle-label">
            <input v-model="includeArchived" type="checkbox" /> Show archived
          </label>
        </div>
        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="classes.length === 0" class="empty">No classes yet</div>
        <ul v-else class="class-list">
          <li
            v-for="c in classes"
            :key="c.id"
            class="class-item"
            :class="{ selected: selectedClassId === c.id, archived: c.archived_at }"
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
                <span class="class-name">
                  {{ c.name }}
                  <span v-if="c.archived_at" class="archived-tag">archived</span>
                </span>
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
            <!-- BUG-005: admin has read-only access to class management, so admins
                 see only the read-only QR action below; every mutating button is
                 gated to teachers. BUG-004: New Code / Rename are teacher-write
                 (owner + co-teacher), while Archive / Delete are owner-only and
                 carry a per-row ownership check so a co-teacher is not offered an
                 action the backend always rejects with 403. -->
            <div v-if="isTeacherOrAdmin" class="class-actions">
              <button v-if="auth.isTeacher" class="btn-sm" :disabled="!!c.archived_at || regeneratingId === c.id" @click.stop="regenerateCode(c.id)">
                {{ regeneratingId === c.id ? 'Generating…' : 'New Code' }}
              </button>
              <button class="btn-sm" @click.stop="loadQr(c.id)">QR</button>
              <button v-if="auth.isTeacher" class="btn-sm" @click.stop="startRename(c)">Rename</button>
              <button v-if="auth.isTeacher && isClassOwner(c)" class="btn-sm" :disabled="archivingId === c.id" @click.stop="toggleArchive(c)">
                {{ c.archived_at ? 'Unarchive' : 'Archive' }}
              </button>
              <button
                v-if="auth.isTeacher && isClassOwner(c)"
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

      <div v-if="showQr && qrCode" class="section qr-block">
        <h3 class="section-title">Join Code QR</h3>
        <div class="qr-payload" :title="qrCode.join_url">
          <code>{{ qrCode.join_url }}</code>
        </div>
        <p class="hint">Share this link or have students enter code <strong>{{ qrCode.code }}</strong>.</p>
        <button class="btn-sm" @click="showQr = false">Close</button>
      </div>

      <div v-if="isTeacherOrAdmin && selectedClassId && selectedClass" class="section">
        <h3 class="section-title">Students — {{ selectedClass.name }}</h3>

        <form v-if="canManageStudents" class="inline-form" @submit.prevent="addStudent">
          <input v-model="newStudentEmail" class="rune-input" type="email" placeholder="Student email" />
          <button class="btn" type="submit" :disabled="addingStudent">
            {{ addingStudent ? 'Adding…' : 'Add' }}
          </button>
        </form>

        <details v-if="canManageStudents" class="details-block">
          <summary>Bulk add by email</summary>
          <textarea
            v-model="bulkEmailsText"
            class="rune-input bulk-textarea"
            placeholder="Paste emails — separated by commas, spaces, or newlines"
            rows="4"
          />
          <button class="btn-sm" :disabled="bulkAdding" @click="bulkAddStudents">
            {{ bulkAdding ? 'Adding…' : 'Bulk Add' }}
          </button>
          <div v-if="bulkResult" class="bulk-result">
            <div>Added: {{ bulkResult.added.length }}, Invited: {{ bulkResult.invited.length }}, Skipped: {{ bulkResult.skipped.length }}</div>
            <ul v-if="bulkResult.skipped.length" class="skipped-list">
              <li v-for="(s, idx) in bulkResult.skipped" :key="idx">{{ s.email }} — {{ s.reason }}</li>
            </ul>
          </div>
        </details>

        <div v-if="studentsLoading" class="loading">Loading…</div>
        <div v-else-if="studentsError" class="class-error">{{ studentsError }}</div>
        <ul v-else-if="students.length > 0" class="student-list">
          <li v-for="s in students" :key="s.id" class="student-item">
            <div class="student-info">
              <span class="student-name">{{ s.player_name || s.student_id }}</span>
              <span class="student-email">{{ s.email }}</span>
            </div>
            <div class="student-actions">
              <button
                v-if="canManageStudents && selectedGroupId"
                class="btn-sm"
                @click="assignToGroup(s.student_id)"
              >
                → Group
              </button>
              <button v-if="canManageStudents" class="btn-sm danger" @click="removeStudent(s.student_id, s.player_name || s.student_id)">Remove</button>
            </div>
          </li>
        </ul>
        <div v-else class="empty">No students yet</div>

        <!-- Pending invites -->
        <div v-if="invites.length" class="subsection">
          <h4 class="subsection-title">Pending Invites</h4>
          <ul class="invite-list">
            <li v-for="inv in invites" :key="inv.id" class="invite-item">
              <span>{{ inv.email }}</span>
              <button v-if="canManageStudents" class="btn-sm danger" @click="revokeInvite(inv.email)">Revoke</button>
            </li>
          </ul>
        </div>

        <!-- Co-teachers -->
        <div v-if="selectedIsOwner" class="subsection">
          <h4 class="subsection-title">Co-teachers</h4>
          <form class="inline-form" @submit.prevent="addCoTeacher">
            <input v-model="newCoTeacherEmail" class="rune-input" type="email" placeholder="Co-teacher email" />
            <button class="btn-sm" type="submit">Add</button>
          </form>
          <ul v-if="coTeachers.length" class="invite-list">
            <li v-for="co in coTeachers" :key="co.id" class="invite-item">
              <span>{{ co.player_name }} <small>({{ co.email }})</small></span>
              <button class="btn-sm danger" @click="removeCoTeacher(co.teacher_id)">Remove</button>
            </li>
          </ul>
        </div>

        <!-- Transfer ownership -->
        <div v-if="selectedIsOwner" class="subsection">
          <h4 class="subsection-title">Transfer Ownership</h4>
          <form class="inline-form" @submit.prevent="transferClass(selectedClassId)">
            <input v-model="transferTeacherId" class="rune-input" type="text" placeholder="New teacher user ID" />
            <button class="btn-sm danger" type="submit">Transfer</button>
          </form>
        </div>

        <!-- Groups -->
        <div class="subsection">
          <h4 class="subsection-title">Groups</h4>
          <form v-if="canManageStudents" class="inline-form" @submit.prevent="createGroup">
            <input v-model="newGroupName" class="rune-input" type="text" placeholder="Group name" />
            <input v-model="newGroupColor" class="rune-input color-input" type="text" placeholder="#color" />
            <button class="btn-sm" type="submit">Create</button>
          </form>
          <ul v-if="groups.length" class="invite-list">
            <li v-for="g in groups" :key="g.id" class="invite-item" :class="{ selected: selectedGroupId === g.id }">
              <span
                :style="g.color ? `color: ${g.color}` : ''"
                class="group-name"
                @click="selectGroup(g.id)"
              >
                {{ g.name }} <small>({{ g.member_count }})</small>
              </span>
              <button v-if="canManageStudents" class="btn-sm danger" @click="deleteGroup(g.id)">Delete</button>
            </li>
          </ul>
          <div v-if="selectedGroupId">
            <h5 class="subsection-title">Group Members</h5>
            <ul v-if="groupMembers.length" class="invite-list">
              <li v-for="gm in groupMembers" :key="gm.student_id" class="invite-item">
                <span>{{ gm.player_name || gm.student_id }}</span>
                <button v-if="canManageStudents" class="btn-sm danger" @click="unassignFromGroup(gm.student_id)">Remove</button>
              </li>
            </ul>
            <div v-else class="empty">No members</div>
          </div>
        </div>

        <!-- Leaderboard + Report -->
        <div class="subsection">
          <h4 class="subsection-title">Class Reports</h4>
          <div class="row-between">
            <button class="btn-sm" @click="toggleLeaderboard">
              {{ showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard' }}
            </button>
            <button class="btn-sm" @click="downloadReport">Download CSV</button>
          </div>
          <ol v-if="showLeaderboard && leaderboard.length" class="leaderboard-list">
            <li v-for="(r, idx) in leaderboard" :key="r.student_id">
              <span class="lb-rank">#{{ idx + 1 }}</span>
              <span class="lb-name">{{ r.player_name || r.student_id }}</span>
              <span class="lb-score">{{ r.total_score }} pts · ★{{ r.average_stars.toFixed(1) }} · {{ r.sessions_played }} runs</span>
            </li>
          </ol>
          <div v-else-if="showLeaderboard" class="empty">No leaderboard data yet</div>
        </div>
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
  min-height: 100dvh;
  padding-top: 40px;
}

.class-panel {
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

.class-title {
  font-size: var(--text-lg);
  /* Mono title kept after Phase 1 swapped --font-main to system-ui. */
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  text-align: center;
}

.class-error { font-size: var(--text-xs); color: var(--clay-deep); }

.section { display: flex; flex-direction: column; gap: 8px; }
.subsection { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; border-top: 1px dashed var(--line-strong); padding-top: 8px; }
.section-title { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); letter-spacing: 2px; text-transform: uppercase; margin: 0; }
.subsection-title { font-size: var(--text-xs); color: var(--charcoal-soft); margin: 0; }

.row-between { display: flex; justify-content: space-between; align-items: center; }
.toggle-label { font-size: var(--text-xs); color: var(--charcoal-soft); display: flex; align-items: center; gap: 6px; }

.inline-form { display: flex; gap: 8px; }
.inline-form .rune-input { flex: 1; }
.color-input { max-width: 80px; }

.class-list, .student-list, .invite-list, .leaderboard-list, .skipped-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 6px;
}

.class-item {
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  font-size: var(--text-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.class-item.selected { border-color: var(--terracotta); }
.class-item.archived { opacity: 0.55; }

.archived-tag {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  margin-left: 6px;
  padding: 1px 4px;
  border: 1px dashed var(--line-strong);
}

.class-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  gap: 8px;
}

.class-name { color: var(--charcoal); font-weight: 700; flex: 1; }

.teacher-name {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  opacity: 0.8;
}

.join-code {
  font-family: var(--font-mono);
  color: var(--terracotta-deep);
  background: rgba(168, 188, 203, 0.24);
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 1px;
  transition: color 0.15s;
  white-space: nowrap;
}

.join-code:hover { color: var(--charcoal); }
.join-code.copied { color: var(--sage-deep); }

.rename-input { flex: 1; font-size: var(--text-xs); }
.rename-btns { display: flex; gap: 4px; }
.class-actions { display: flex; gap: 4px; flex-wrap: wrap; }

.student-item, .invite-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-sm);
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--line-strong);
}
.invite-item.selected { background: rgba(199, 157, 80, 0.08); }
.student-info { display: flex; flex-direction: column; gap: 2px; }
.student-name { color: var(--charcoal); font-weight: 600; }
.student-email { font-size: var(--text-2xs); color: var(--charcoal-soft); opacity: 0.8; }
.student-actions { display: flex; gap: 4px; }
.group-name { cursor: pointer; }

.details-block { font-size: var(--text-xs); border: 1px dashed var(--line-strong); padding: 6px; }
.details-block summary { cursor: pointer; color: var(--charcoal-soft); }
.bulk-textarea { width: 100%; font-family: var(--font-mono); font-size: var(--text-xs); }
.bulk-result { font-size: var(--text-xs); color: var(--charcoal-soft); margin-top: 6px; }

.qr-block { border: 1px solid var(--line-strong); padding: 8px; }
.qr-payload code { font-family: var(--font-mono); font-size: var(--text-xs); word-break: break-all; }
.hint { font-size: var(--text-xs); color: var(--charcoal-soft); }

.leaderboard-list { font-size: var(--text-xs); }
.leaderboard-list li { display: flex; gap: 8px; }
.lb-rank { color: var(--terracotta-deep); width: 32px; font-family: var(--font-mono); }
.lb-name { flex: 1; }
.lb-score { color: var(--charcoal-soft); font-family: var(--font-mono); }

.btn-sm {
  font-size: var(--text-xs);
  padding: 2px 12px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--charcoal-soft);
  cursor: pointer;
  transition: all 0.16s ease;
}
.btn-sm:hover:not(:disabled) { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); border-color: var(--terracotta); }
.btn-sm.danger { border-color: rgba(185, 134, 116, 0.5); color: var(--clay-deep); }
.btn-sm.danger:hover { background: var(--clay); color: #fff; }
.btn-sm:disabled { opacity: 0.4; cursor: default; }

.loading, .empty { font-size: var(--text-sm); color: var(--charcoal-soft); font-style: italic; }

.back-btn {
  font-size: var(--text-xs);
  letter-spacing: 1px;
  border-color: var(--line);
  color: var(--charcoal-soft);
}
.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }
</style>
