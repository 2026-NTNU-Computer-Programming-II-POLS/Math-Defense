<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { classService, type ClassInfo, type ClassReflection } from '@/services/classService'
import { territoryService, type ActivityInfo } from '@/services/territoryService'
import {
  assessmentService,
  type ClassPosteriors,
} from '@/services/assessmentService'
import CompetencyBar from '@/components/teacher/CompetencyBar.vue'
import { formatScore } from '@/utils/formatters'

const router = useRouter()

const classes = ref<ClassInfo[]>([])
const activities = ref<ActivityInfo[]>([])
const reflections = ref<ClassReflection[]>([])
const competencies = ref<ClassPosteriors[]>([])
const loading = ref(false)
const error = ref('')

const RANDOMISATION_EXPLAINER_KEY = 'teacher-dashboard-randomisation-explainer-seen'
const explainerOpen = ref(false)

function formatDate(value: string | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function classNameFor(classId: string): string {
  return classes.value.find((c) => c.id === classId)?.name ?? classId
}

onMounted(async () => {
  try {
    if (localStorage.getItem(RANDOMISATION_EXPLAINER_KEY) !== '1') {
      explainerOpen.value = true
      localStorage.setItem(RANDOMISATION_EXPLAINER_KEY, '1')
    }
  } catch {
    explainerOpen.value = true
  }

  loading.value = true
  try {
    const [cls, acts] = await Promise.all([
      classService.listClasses(),
      territoryService.listActivities(),
    ])
    classes.value = cls
    activities.value = acts
    // Reflections are scoped per-class; aggregate across all classes the
    // teacher owns. Failures on one class shouldn't blank the whole list.
    const ownedClassIds = (cls as ClassInfo[])
      .filter((c) => 'join_code' in c && c.join_code)
      .map((c) => c.id)
    const refLists = await Promise.all(
      ownedClassIds.map((id) =>
        classService.listReflections(id).catch(() => [] as ClassReflection[]),
      ),
    )
    reflections.value = refLists
      .flat()
      .sort((a, b) => (b.ended_at || '').localeCompare(a.ended_at || ''))
    // Per-student competency posteriors (Pedagogical_Backlog_Spec §9). One
    // request per owned class; tolerate per-class failures so a single bad
    // class id doesn't blank the whole dashboard.
    const postLists = await Promise.all(
      ownedClassIds.map((id) =>
        assessmentService
          .classPosteriors(id)
          .catch(() => ({ class_id: id, students: [] } as ClassPosteriors)),
      ),
    )
    competencies.value = postLists.filter((p) => p.students.length > 0)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="teacher-dashboard">
    <div class="dashboard-panel rune-panel">
      <h2 class="dashboard-title">Teacher Dashboard</h2>

      <details class="explainer" :open="explainerOpen">
        <summary class="explainer-summary">Why are paths random?</summary>
        <div class="explainer-body">
          <p>
            When students keep meeting the same enemies on the same path, practice starts
            to feel easy and they predict what is coming. Bjork &amp; Bjork (2011) call this
            a "desirable difficulty" problem: smooth, predictable practice often <em>feels</em>
            productive but produces weaker long-term retention than practice that is varied
            and slightly harder in the moment.
          </p>
          <p>
            Randomising spawn order and path layout breaks that predictability. Students
            cannot rehearse a fixed sequence, so each round forces real retrieval and
            decision-making. The session may feel a little harder — that gap between how
            well they think they are doing and how well they are actually learning is
            exactly the gap Bjork &amp; Bjork describe, and it is the point.
          </p>
        </div>
      </details>

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-if="loading" class="loading">Loading…</div>

      <template v-else>
        <div class="section">
          <h3 class="section-title">My Classes ({{ classes.length }})</h3>
          <ul v-if="classes.length > 0" class="item-list">
            <li v-for="c in classes" :key="c.id" class="item" @click="router.push(`/classes?select=${c.id}`)">
              <span class="item-name">{{ c.name }}</span>
              <span v-if="c.join_code" class="item-meta">{{ c.join_code }}</span>
            </li>
          </ul>
          <div v-else class="empty">No classes yet</div>
        </div>

        <div class="section">
          <h3 class="section-title">Active GT Activities ({{ activities.filter(a => !a.settled).length }})</h3>
          <ul v-if="activities.length > 0" class="item-list">
            <li
              v-for="a in activities"
              :key="a.id"
              class="item"
              @click="router.push(`/territory/${a.id}`)"
            >
              <span class="item-name">{{ a.title }}</span>
              <span :class="['item-badge', { settled: a.settled }]">
                {{ a.settled ? 'Settled' : 'Active' }}
              </span>
            </li>
          </ul>
          <div v-else class="empty">No activities yet</div>
        </div>

        <div v-for="cp in competencies" :key="cp.class_id" class="section">
          <h3 class="section-title">
            Class Competencies — {{ classNameFor(cp.class_id) }} ({{ cp.students.length }})
          </h3>
          <ul class="item-list">
            <li
              v-for="row in cp.students"
              :key="row.student_id"
              class="competency-row"
            >
              <div class="competency-head">
                <span class="item-name">{{ row.student_name || row.student_id }}</span>
                <span class="item-meta">↓ {{ row.lowest_competency }}</span>
              </div>
              <CompetencyBar
                :posteriors="row.posteriors"
                :highlight="row.lowest_competency"
              />
              <p class="competency-suggestion">{{ row.suggestion }}</p>
            </li>
          </ul>
        </div>

        <div class="section">
          <h3 class="section-title">Recent Reflections ({{ reflections.length }})</h3>
          <ul v-if="reflections.length > 0" class="item-list">
            <li v-for="r in reflections" :key="r.session_id" class="reflection-row">
              <div class="reflection-head">
                <span class="item-name">{{ r.student_name || r.student_id }}</span>
                <span class="item-meta">★{{ r.star_rating }} · {{ formatScore(r.total_score ?? r.score) }} pts · {{ formatDate(r.ended_at) }}</span>
              </div>
              <p class="reflection-text">{{ r.reflection_text }}</p>
            </li>
          </ul>
          <div v-else class="empty">No student reflections yet</div>
        </div>

        <div class="dashboard-actions">
          <button class="btn" @click="router.push('/territory/create')">+ New Activity</button>
          <button class="btn" @click="router.push('/classes')">Manage Classes</button>
          <button class="btn" @click="router.push('/rankings')">Rankings</button>
          <button class="btn back-btn" @click="router.push('/')">← Back</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.teacher-dashboard {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: 40px;
}

.dashboard-panel {
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

.dashboard-title {
  font-size: var(--text-lg);
  /* Mono title kept after Phase 1 swapped --font-main to system-ui. */
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  text-align: center;
}

.error-msg { font-size: var(--text-xs); color: var(--clay-deep); }
.loading, .empty { font-size: var(--text-sm); color: var(--charcoal-soft); font-style: italic; }

.section { display: flex; flex-direction: column; gap: 6px; }
.section-title { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); letter-spacing: 2px; text-transform: uppercase; margin: 0; }

.item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: border-color 0.16s ease;
}

.item:hover { border-color: var(--terracotta); }

.item-name { color: var(--charcoal); font-weight: 600; }
.item-meta { font-family: var(--font-mono); color: var(--charcoal-soft); font-size: var(--text-xs); }

.item-badge {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(126, 144, 119, 0.32);
  background: rgba(126, 144, 119, 0.18);
  color: var(--sage-deep);
  font-size: var(--text-2xs);
}

.item-badge.settled { border-color: rgba(79, 74, 72, 0.16); background: rgba(79, 74, 72, 0.07); color: var(--charcoal-soft); }

.dashboard-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.back-btn { border-color: var(--line); color: var(--charcoal-soft); }
.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.reflection-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: var(--text-sm);
}

.reflection-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.reflection-text {
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.4;
}

.competency-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--axis);
  padding: 8px 10px;
  font-size: var(--text-sm);
}

.competency-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.competency-suggestion {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.3;
  font-style: italic;
}

.explainer {
  border: 1px solid var(--axis);
  padding: 8px 10px;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.explainer[open] {
  border-color: var(--gold);
}

.explainer-summary {
  cursor: pointer;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-size: var(--text-xs);
  list-style: none;
}

.explainer-summary::-webkit-details-marker { display: none; }

.explainer-summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.15s ease;
}

.explainer[open] .explainer-summary::before {
  content: '▾ ';
}

.explainer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  line-height: 1.5;
}

.explainer-body p { margin: 0; }
</style>
