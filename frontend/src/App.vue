<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const navigating = ref(false)

router.beforeEach(() => { navigating.value = true })
router.afterEach(() => { navigating.value = false })
</script>

<template>
  <div class="app-root" :aria-busy="String(navigating)">
    <div v-if="navigating" class="nav-progress" aria-hidden="true" />
    <RouterView v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </div>
</template>

<style>
.app-root {
  min-height: 100vh;
}

.nav-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--gold, #ffd700);
  z-index: 9999;
  animation: nav-progress-slide 1.5s ease-in-out infinite;
  transform-origin: left;
}

@keyframes nav-progress-slide {
  0%   { transform: scaleX(0); opacity: 1; }
  70%  { transform: scaleX(0.85); opacity: 1; }
  100% { transform: scaleX(1); opacity: 0; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
