<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useManual, type ManualMode } from '@/composables/useManual'

const props = defineProps<{
  open: boolean
  // 'full'      — gameplay manual + field reference (menu)
  // 'reference' — field reference only (in-game)
  mode: ManualMode
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const {
  books,
  loading,
  error,
  activeBookId,
  activeSectionId,
  activeBook,
  activeSection,
  load,
  selectBook,
  selectSection,
} = useManual(toRef(props, 'mode'))

const boxRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null

// Collapsible section sidebar — lets the reader hand the full width back to the
// article body. The choice is remembered across sessions; storage failures
// (private mode / disabled) fall back to "open" without throwing.
const SIDEBAR_PREF_KEY = 'mathDefense.manualSidebarOpen'
const sidebarOpen = ref(true)
try {
  sidebarOpen.value = localStorage.getItem(SIDEBAR_PREF_KEY) !== '0'
} catch { /* storage unavailable — keep the default open state */ }

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value
  try {
    localStorage.setItem(SIDEBAR_PREF_KEY, sidebarOpen.value ? '1' : '0')
  } catch { /* ignore persistence failures */ }
}

const title = computed(() => (props.mode === 'full' ? 'Math Defense — Manual' : 'Field Reference'))

watch(activeSectionId, () => {
  void nextTick(() => scrollRef.value?.scrollTo({ top: 0 }))
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    previousFocus = document.activeElement as HTMLElement | null
    void load().then(() => {
      requestAnimationFrame(() => boxRef.value?.focus())
    })
  },
  { immediate: true },
)

function close(): void {
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  // `[` toggles the section sidebar — ignored while typing in a field and when
  // combined with a modifier so it never shadows a real shortcut.
  if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    e.preventDefault()
    e.stopPropagation()
    toggleSidebar()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, { capture: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true } as EventListenerOptions)
  const target = previousFocus
  previousFocus = null
  if (target && document.contains(target) && typeof target.focus === 'function') {
    try { target.focus() } catch { /* detached/disabled — ignore */ }
  }
})
</script>

<template>
  <div
    v-if="open"
    class="manual-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="manual-title"
    :class="{ 'manual-overlay--ingame': mode === 'reference' }"
    @click.self="close"
  >
    <div
      ref="boxRef"
      class="manual-box card-ornate"
      tabindex="-1"
    >
      <span class="card-corner card-corner--inset card-corner-tl" aria-hidden="true"></span>
      <span class="card-corner card-corner--inset card-corner-tr" aria-hidden="true"></span>
      <span class="card-corner card-corner--inset card-corner-bl" aria-hidden="true"></span>
      <span class="card-corner card-corner--inset card-corner-br" aria-hidden="true"></span>
      <header class="manual-header">
        <div class="manual-header-left">
          <button
            v-if="activeBook"
            type="button"
            class="manual-sidebar-toggle"
            :aria-expanded="sidebarOpen"
            aria-controls="manual-sections"
            :aria-label="sidebarOpen ? 'Hide section list' : 'Show section list'"
            :title="(sidebarOpen ? 'Hide section list' : 'Show section list') + ' ([)'"
            @click="toggleSidebar"
          >{{ sidebarOpen ? '«' : '»' }}</button>
          <h2 id="manual-title" class="manual-title">{{ title }}</h2>
        </div>
        <button
          type="button"
          class="manual-close"
          aria-label="Close manual"
          @click="close"
        >×</button>
      </header>

      <nav v-if="mode === 'full' && books.length > 1" class="manual-tabs" role="tablist">
        <button
          v-for="b in books"
          :key="b.id"
          type="button"
          role="tab"
          :aria-selected="b.id === activeBookId"
          class="manual-tab"
          :class="{ 'manual-tab--active': b.id === activeBookId }"
          @click="selectBook(b.id)"
        >{{ b.label }}</button>
      </nav>

      <div class="manual-body">
        <p v-if="loading" class="manual-state">Loading manual…</p>
        <p v-else-if="error" class="manual-state error">
          Could not load manual ({{ error }}).
        </p>
        <template v-else-if="activeBook">
          <button
            v-show="!sidebarOpen"
            type="button"
            class="manual-sidebar-rail"
            aria-controls="manual-sections"
            :aria-expanded="sidebarOpen"
            aria-label="Show section list"
            title="Show section list ([)"
            @click="toggleSidebar"
          >»</button>
          <aside v-show="sidebarOpen" id="manual-sections" class="manual-sidebar" aria-label="Sections">
            <button
              v-for="s in activeBook.sections"
              :key="s.id"
              type="button"
              class="manual-section-link"
              :class="{ 'manual-section-link--active': s.id === activeSectionId }"
              @click="selectSection(s.id)"
            >{{ s.title }}</button>
          </aside>

          <div ref="scrollRef" class="manual-scroll">
            <h3 v-if="activeSection" class="manual-section-title">{{ activeSection.title }}</h3>
            <article
              v-if="activeSection"
              class="manual-content"
              v-html="activeSection.html"
            />
          </div>
        </template>
      </div>

      <footer class="manual-footer">
        <span><kbd>[</kbd> toggle sections · <kbd>Esc</kbd> close</span>
      </footer>
    </div>
  </div>
</template>

<style scoped src="./ManualModal.css"></style>
