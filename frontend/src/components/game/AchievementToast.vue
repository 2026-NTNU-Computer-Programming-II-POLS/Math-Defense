<script setup lang="ts">
import { ref, watch } from 'vue'
import { ACHIEVEMENT_DEFS } from '@/data/achievement-defs'

export interface ToastItem {
  id: string
  name: string
  talentPoints: number
}

const props = defineProps<{ achievements: { id: string; talent_points: number }[] }>()
const visible = ref<ToastItem[]>([])
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.achievements, (newVal) => {
  if (!newVal || newVal.length === 0) return
  const items: ToastItem[] = newVal.map(a => {
    const def = ACHIEVEMENT_DEFS[a.id]
    return {
      id: a.id,
      name: def?.name ?? a.id,
      talentPoints: a.talent_points,
    }
  })
  visible.value = items
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { visible.value = [] }, 5000)
}, { deep: true })
</script>

<template>
  <Transition name="toast">
    <div v-if="visible.length > 0" class="achievement-toast">
      <div v-for="item in visible" :key="item.id" class="toast-item">
        <span class="toast-icon">&#10003;</span>
        <span class="toast-text">{{ item.name }}</span>
        <span class="toast-tp">+{{ item.talentPoints }} TP</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.achievement-toast {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 44px + 8px);
  right: 16px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(26, 21, 32, 0.95);
  border: 1px solid var(--gold);
  border-radius: 4px;
  font-size: 12px;
  animation: slideIn 0.3s ease-out;
}

.toast-icon { color: var(--gold); font-size: 14px; }
.toast-text { color: #e8dcc8; }
.toast-tp { color: var(--gold); font-size: 10px; margin-left: auto; }

.toast-enter-active { animation: slideIn 0.3s ease-out; }
.toast-leave-active { animation: slideIn 0.3s ease-in reverse; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .toast-item {
    animation: none;
  }
  .toast-enter-active,
  .toast-leave-active {
    animation: none;
    transition: opacity 0.15s;
  }
}
</style>
