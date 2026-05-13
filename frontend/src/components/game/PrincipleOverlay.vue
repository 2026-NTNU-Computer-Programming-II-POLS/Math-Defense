<script setup lang="ts">
/**
 * PrincipleOverlay — post-wave principle-surfacing card (Backlog item #1).
 *
 * Renders a single, dismissible card naming the mathematical principle the
 * player just exercised. Auto-dismisses after 8s or on click. Optional —
 * gated upstream by `uiStore.principleOverlayEnabled`.
 *
 * Pattern: parent feeds the `principleId` prop; component owns the timer and
 * emits `dismiss` (which the parent uses to clear the prop). Decoupling the
 * component from the engine event bus keeps it testable with fake timers.
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { PRINCIPLE_DEFS, type PrincipleId } from '@/data/principle-defs'
import MathDisplay from '@/components/common/MathDisplay.vue'

const props = defineProps<{ principleId: PrincipleId | null }>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()

const AUTO_DISMISS_MS = 8000

const visibleId = ref<PrincipleId | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function dismiss(): void {
  if (visibleId.value === null) return
  clearTimer()
  visibleId.value = null
  emit('dismiss')
}

watch(() => props.principleId, (id) => {
  clearTimer()
  visibleId.value = id
  if (id !== null) {
    timer = setTimeout(() => { dismiss() }, AUTO_DISMISS_MS)
  }
}, { immediate: true })

onBeforeUnmount(clearTimer)
</script>

<template>
  <Transition name="principle">
    <div
      v-if="visibleId !== null"
      class="principle-overlay"
      role="status"
      aria-live="polite"
      data-testid="principle-overlay"
      @click="dismiss"
    >
      <div class="principle-card">
        <div class="principle-eyebrow">Principle in play</div>
        <h3 class="principle-title">{{ PRINCIPLE_DEFS[visibleId].title }}</h3>
        <div class="principle-formula">
          <MathDisplay :latex="PRINCIPLE_DEFS[visibleId].latex" :display-mode="true" />
        </div>
        <p class="principle-prose">{{ PRINCIPLE_DEFS[visibleId].prose }}</p>
        <div class="principle-dismiss-hint">click to dismiss</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.principle-overlay {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast, 80);
  cursor: pointer;
}

.principle-card {
  width: 460px;
  max-width: calc(100vw - 32px);
  padding: 14px 18px 12px;
  background: rgba(26, 21, 32, 0.96);
  border: 1px solid var(--gold);
  border-radius: 4px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  color: #e8dcc8;
  font-family: var(--font-mono);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.principle-eyebrow {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--axis);
  text-transform: uppercase;
}

.principle-title {
  margin: 0;
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--gold-bright, var(--gold));
}

.principle-formula {
  text-align: center;
  padding: 4px 0 2px;
}

.principle-prose {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #d4cab4;
}

.principle-dismiss-hint {
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--axis);
  opacity: 0.6;
  text-align: right;
}

.principle-enter-active,
.principle-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.principle-enter-from,
.principle-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .principle-enter-active,
  .principle-leave-active {
    transition: opacity 0.15s;
  }
  .principle-enter-from,
  .principle-leave-to {
    transform: translateX(-50%);
  }
}
</style>
