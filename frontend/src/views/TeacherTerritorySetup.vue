<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'
import { classService, type ClassInfo } from '@/services/classService'

const router = useRouter()
const store = useTerritoryStore()
const auth = useAuthStore()

const title = ref('')
const deadline = ref('')
const selectedClassId = ref<string | null>(null)
const slots = ref<{ star_rating: number }[]>([{ star_rating: 1 }])
const classes = ref<ClassInfo[]>([])
const submitting = ref(false)
const validationError = ref('')
const classesLoaded = ref(false)

// B-M-13: admins can always create; teachers need at least one class
const hasNoClasses = computed(() => classesLoaded.value && !auth.isAdmin && classes.value.length === 0)

const hasDuplicateStars = computed(() => {
  const ratings = slots.value.map(s => s.star_rating)
  return ratings.length !== new Set(ratings).size
})

function addSlot(): void {
  slots.value.push({ star_rating: 1 })
}

function removeSlot(index: number): void {
  if (slots.value.length > 1) slots.value.splice(index, 1)
}

async function submit(): Promise<void> {
  if (!title.value.trim()) {
    validationError.value = 'Please enter a title'
    return
  }
  if (!deadline.value) {
    validationError.value = 'Please set a deadline'
    return
  }
  validationError.value = ''
  submitting.value = true
  try {
    const activity = await store.createActivity({
      title: title.value.trim(),
      deadline: new Date(deadline.value).toISOString(),
      class_id: selectedClassId.value,
      slots: slots.value.map((s) => ({ star_rating: s.star_rating })),
    })
    if (activity) router.push(`/territory/${activity.id}`)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    classes.value = await classService.listClasses()
    if (classes.value.length > 0) {
      selectedClassId.value = classes.value[0].id
    }
  } catch {
    classes.value = []
  } finally {
    classesLoaded.value = true
  }
})
</script>

<template>
  <div class="setup-view">
    <div class="setup-panel rune-panel">
      <h2 class="setup-title">Create Territory Activity</h2>

      <div v-if="hasNoClasses" class="error-msg">
        You don't have any classes yet. Create a class first before setting up a territory activity.
      </div>
      <div v-else-if="validationError" class="error-msg">{{ validationError }}</div>
      <div v-else-if="store.errorCreate" class="error-msg">{{ store.errorCreate }}</div>

      <div v-if="hasNoClasses" class="form-actions">
        <button class="btn back-btn" type="button" @click="router.push('/territory')">← Back</button>
      </div>

      <form v-if="!hasNoClasses" class="setup-form" @submit.prevent="submit">
        <div class="field">
          <label class="field-label">Title</label>
          <input v-model="title" type="text" class="rune-input" placeholder="Activity title" />
        </div>

        <div class="field">
          <label class="field-label">Deadline</label>
          <input v-model="deadline" type="datetime-local" class="rune-input" />
        </div>

        <div class="field">
          <label class="field-label">Class (optional)</label>
          <select v-model="selectedClassId" class="rune-input">
            <option :value="null">Inter-class (all students)</option>
            <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div class="field">
          <label class="field-label">Territory Slots</label>
          <div class="slot-list">
            <div v-for="(s, i) in slots" :key="i" class="slot-row">
              <span class="slot-num">#{{ i + 1 }}</span>
              <select v-model.number="s.star_rating" class="rune-input star-select">
                <option v-for="n in 5" :key="n" :value="n">{{ '★'.repeat(n) }} ({{ n }})</option>
              </select>
              <button type="button" class="btn-sm danger" :disabled="slots.length <= 1" @click="removeSlot(i)">×</button>
            </div>
          </div>
          <button type="button" class="btn-sm" @click="addSlot">+ Add Slot</button>
          <div v-if="hasDuplicateStars" class="warn-msg">Multiple slots share the same star rating — students will face the same difficulty for those territories.</div>
        </div>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="submitting || !title.trim() || !deadline">
            {{ submitting ? 'Creating…' : 'Create Activity' }}
          </button>
          <button class="btn back-btn" type="button" @click="router.push('/territory')">Cancel</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.setup-panel {
  width: 440px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setup-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 3px;
  text-align: center;
}

.error-msg { font-size: 11px; color: var(--enemy-red); }
.warn-msg { font-size: 10px; color: var(--gold); margin-top: 4px; }

.setup-form { display: flex; flex-direction: column; gap: 12px; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 11px; color: var(--gold); }

.slot-list { display: flex; flex-direction: column; gap: 6px; }

.slot-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slot-num { font-size: 10px; color: var(--axis); min-width: 24px; }
.star-select { flex: 1; }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; }

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

.btn-sm:hover { background: var(--axis); color: var(--stone-dark); }
.btn-sm.danger { border-color: var(--enemy-red); color: var(--enemy-red); }
.btn-sm.danger:hover { background: var(--enemy-red); color: var(--stone-dark); }
.btn-sm:disabled { opacity: 0.3; cursor: default; }

.back-btn { border-color: var(--axis); color: var(--axis); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
