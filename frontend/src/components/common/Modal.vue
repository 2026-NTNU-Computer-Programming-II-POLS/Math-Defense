<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUiStore } from '@/stores/uiStore'

const uiStore = useUiStore()

const titleId = `modal-title-${Math.random().toString(36).slice(2, 10)}`
const boxRef = ref<HTMLElement | null>(null)
const okBtnRef = ref<HTMLButtonElement | null>(null)

// Save the previously focused element so focus can be restored on close
let previousFocus: HTMLElement | null = null

function close(): void {
  uiStore.closeModal()
}

function trapFocus(event: KeyboardEvent): void {
  // Keep keyboard focus inside the modal while it's open
  if (event.key !== 'Tab') return
  const box = boxRef.value
  if (!box) return
  const focusables = box.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  await nextTick()
  okBtnRef.value?.focus()
})

onBeforeUnmount(() => {
  // Only restore if the saved target is still in the DOM AND focusable. When
  // one modal replaces another (e.g. an error modal opens on top of the
  // original), the saved focus may be a now-detached button — focusing it
  // dumps focus on <body> and breaks keyboard navigation. Fall back to
  // letting the browser resolve focus naturally in that case.
  const target = previousFocus
  previousFocus = null
  if (!target) return
  if (!document.contains(target)) return
  // `focus` exists on HTMLElement; guard for the (rare) case of a non-element
  // having slipped into document.activeElement.
  if (typeof target.focus !== 'function') return
  try { target.focus() } catch { /* detached/disabled — ignore */ }
})
</script>

<template>
  <div
    class="modal-overlay"
    @click.self="close"
    @keydown.esc.prevent.stop="close"
    @keydown="trapFocus"
  >
    <div
      ref="boxRef"
      class="modal-box rune-panel"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <h3 :id="titleId" class="modal-title">{{ uiStore.modalTitle }}</h3>
      <p class="modal-message">{{ uiStore.modalMessage }}</p>
      <button ref="okBtnRef" class="btn modal-ok" @click="close">OK</button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal-box {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}

.modal-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
}

.modal-message {
  font-size: 12px;
  color: #e8dcc8;
  line-height: 1.8;
}

.modal-ok { align-self: center; min-width: 120px; }
</style>
