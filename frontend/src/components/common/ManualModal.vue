<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderMarkdown } from '@/utils/simpleMarkdown'

const props = defineProps<{
  open: boolean
  // 'full'      — gameplay manual followed by the field reference (menu)
  // 'reference' — field reference only (in-game)
  mode: 'full' | 'reference'
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const mechanicsHtml = ref<string>('')
const referenceHtml = ref<string>('')
const loading = ref<boolean>(false)
const error = ref<string | null>(null)
const boxRef = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null

const baseUrl = computed(() => {
  // Respect the deployed Vite base path so the manual loads under sub-paths too.
  const b = import.meta.env.BASE_URL || '/'
  return b.endsWith('/') ? b : `${b}/`
})

async function loadManual(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const needsMechanics = props.mode === 'full' && !mechanicsHtml.value
    const needsReference = !referenceHtml.value
    const targets: Array<Promise<void>> = []
    if (needsMechanics) {
      targets.push(
        fetch(`${baseUrl.value}manual/game-mechanics.md`)
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
          .then((t) => { mechanicsHtml.value = renderMarkdown(t) }),
      )
    }
    if (needsReference) {
      targets.push(
        fetch(`${baseUrl.value}manual/towers-and-enemies.md`)
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
          .then((t) => { referenceHtml.value = renderMarkdown(t) }),
      )
    }
    await Promise.all(targets)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  previousFocus = document.activeElement as HTMLElement | null
  void loadManual().then(() => {
    // After the first paint cycle, push focus into the dialog so Escape works
    // even when the modal was opened by mouse from a click handler.
    requestAnimationFrame(() => boxRef.value?.focus())
  })
}, { immediate: true })

function close(): void {
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
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

const title = computed(() => props.mode === 'full' ? 'Math Defense — Manual' : 'Field Reference')
</script>

<template>
  <div
    v-if="open"
    class="manual-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="manual-title"
    @click.self="close"
  >
    <div
      ref="boxRef"
      class="manual-box"
      tabindex="-1"
    >
      <header class="manual-header">
        <h2 id="manual-title" class="manual-title">{{ title }}</h2>
        <button
          type="button"
          class="manual-close"
          aria-label="Close manual"
          @click="close"
        >×</button>
      </header>

      <div class="manual-scroll">
        <p v-if="loading" class="manual-state">Loading manual…</p>
        <p v-else-if="error" class="manual-state error">
          Could not load manual ({{ error }}).
        </p>
        <template v-else>
          <article v-if="mode === 'full'" class="manual-content" v-html="mechanicsHtml" />
          <hr v-if="mode === 'full'" class="manual-section-divider" />
          <article class="manual-content" v-html="referenceHtml" />
        </template>
      </div>

      <footer class="manual-footer">
        <span>Press <kbd>Esc</kbd> to close</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.manual-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 24px;
}

.manual-box {
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #f3ece0;
  color: var(--text-primary);
  border: 1px solid var(--gold);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  font-family: var(--font-main);
  overflow: hidden;
  outline: none;
}

.manual-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: linear-gradient(180deg, #2a2236 0%, #1a1520 100%);
  color: var(--gold-bright);
  border-bottom: 1px solid var(--gold);
}

.manual-title {
  margin: 0;
  font-size: 16px;
  letter-spacing: 4px;
  text-shadow: var(--gold-shadow);
}

.manual-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: transparent;
  color: var(--gold-bright);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.manual-close:hover,
.manual-close:focus-visible {
  background: var(--gold);
  color: #1a1520;
  outline: none;
}

.manual-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px 28px;
  font-size: 14px;
  line-height: 1.65;
}

.manual-state {
  margin: 0;
  padding: 32px 0;
  text-align: center;
  color: var(--text-secondary);
}
.manual-state.error { color: var(--error-red); }

.manual-section-divider {
  margin: 32px 0;
  border: 0;
  border-top: 2px dashed rgba(196, 114, 6, 0.4);
}

.manual-content :deep(h1) {
  font-size: 22px;
  letter-spacing: 2px;
  margin: 0 0 16px;
  color: var(--menu-navy);
  border-bottom: 2px solid var(--gold);
  padding-bottom: 6px;
}

.manual-content :deep(h2) {
  font-size: 17px;
  margin: 24px 0 10px;
  color: var(--menu-navy);
  letter-spacing: 1px;
}

.manual-content :deep(h3) {
  font-size: 15px;
  margin: 18px 0 8px;
  color: var(--gold-dim);
  letter-spacing: 0.5px;
}

.manual-content :deep(h4) {
  font-size: 13px;
  margin: 14px 0 6px;
  color: var(--text-secondary);
}

.manual-content :deep(p) {
  margin: 8px 0;
}

.manual-content :deep(ul) {
  margin: 8px 0;
  padding-left: 22px;
}

.manual-content :deep(li) {
  margin: 4px 0;
}

.manual-content :deep(strong) {
  color: var(--menu-navy);
}

.manual-content :deep(em) {
  color: var(--text-secondary);
}

.manual-content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 1px 5px;
  background: rgba(196, 114, 6, 0.1);
  border: 1px solid rgba(196, 114, 6, 0.25);
  border-radius: 3px;
  color: var(--gold-dim);
}

.manual-content :deep(pre) {
  margin: 10px 0;
  padding: 12px 14px;
  background: rgba(26, 21, 32, 0.92);
  color: #e8dcc8;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
}

.manual-content :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
}

.manual-content :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(196, 114, 6, 0.35);
}

.manual-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  background: #fff;
  border: 1px solid rgba(196, 114, 6, 0.4);
  border-radius: 4px;
  overflow: hidden;
}

.manual-content :deep(thead) {
  background: rgba(196, 114, 6, 0.16);
}

.manual-content :deep(th),
.manual-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid rgba(196, 114, 6, 0.25);
  text-align: left;
  vertical-align: top;
}

.manual-content :deep(th) {
  color: var(--menu-navy);
  font-weight: 700;
  letter-spacing: 0.5px;
}

.manual-content :deep(a) {
  color: var(--gold-dim);
  text-decoration: underline;
}

.manual-footer {
  padding: 8px 20px;
  background: rgba(26, 21, 32, 0.85);
  color: var(--gold-bright);
  font-size: 11px;
  letter-spacing: 1px;
  text-align: right;
}

.manual-footer kbd {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 2px;
  border: 1px solid var(--gold);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--gold-bright);
}
</style>
