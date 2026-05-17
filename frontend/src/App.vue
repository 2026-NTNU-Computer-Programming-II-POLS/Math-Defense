<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import Modal from '@/components/common/Modal.vue'
import AppShell from '@/components/layout/AppShell.vue'
import GlobalBackground from '@/components/layout/GlobalBackground.vue'

const router = useRouter()
const uiStore = useUiStore()
const navigating = ref(false)

router.beforeEach(() => { navigating.value = true })
router.afterEach(() => { navigating.value = false })

onUnmounted(() => {
  useAuthStore().stopProbe()
})
</script>

<template>
  <div class="app-root" :aria-busy="navigating">
    <div v-if="navigating" class="nav-progress" aria-hidden="true" />
    <RouterView v-slot="{ Component, route }">
      <GlobalBackground v-if="!route.meta.hideGlobalBg" />
      <Transition name="fade" mode="out-in">
        <AppShell v-if="!route.meta.hideShell" :key="`shell-${route.name as string}`">
          <component :is="Component" />
        </AppShell>
        <component :is="Component" v-else :key="`bare-${route.name as string}`" />
      </Transition>
    </RouterView>
    <Modal v-if="uiStore.modalVisible" />
  </div>
</template>

<style>
.app-root {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
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
