<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import ManualModal from '@/components/common/ManualModal.vue'

const router = useRouter()
const auth = useAuthStore()

const manualOpen = ref(false)
</script>

<template>
  <div class="menu-view">
    <div class="menu-title">
      <h1 class="title-main">Math Defense</h1>
      <div class="title-divider"></div>
      <p class="title-motto">Math is magic — defend the origin.</p>
    </div>

    <nav class="menu-nav">
      <button v-if="auth.isStudent || auth.isTeacher || !auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'level-select' })">
        ▶ Start Game
      </button>
      <button class="btn menu-btn" @click="router.push({ name: 'leaderboard' })">
        ◈ Leaderboard
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'territory-list' })">
        ⚔ Claim Territory
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'rankings' })">
        ◈ Full Rankings
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'classes' })">
        ◆ Class Management
      </button>
      <button v-if="auth.isTeacher || auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'teacher-dashboard' })">
        ⬡ Teacher Dashboard
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'profile' })">
        ⬡ {{ auth.user?.player_name }}
      </button>
      <button v-if="auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'admin-teachers' })">
        ✦ Admin Panel
      </button>
      <button class="btn menu-btn" @click="manualOpen = true">
        ◇ Manual
      </button>
      <button class="btn menu-btn" @click="auth.isLoggedIn ? auth.logout() : router.push({ name: 'auth' })">
        {{ auth.isLoggedIn ? '⏻ Log Out' : '⬡ Log In / Register' }}
      </button>
    </nav>

    <ManualModal :open="manualOpen" mode="full" @close="manualOpen = false" />

    <footer class="menu-footer">
      <span>Computer Programming (II) Final Project · 2026</span>
      <span class="menu-footer-sep">·</span>
      <a class="menu-footer-link" href="#" @click.prevent="router.push({ name: 'about' })">Accessibility Statement</a>
    </footer>
  </div>
</template>

<style scoped>
.menu-view {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  gap: 48px;
}

.menu-title {
  position: relative;
  z-index: 1;
  text-align: center;
}

.title-main {
  /* Display hero — explicitly monospace to preserve "rune" feel after
     --font-main moved to system-ui in Phase 1. */
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  color: var(--menu-navy);
  text-shadow: 0 2px 20px rgba(255,255,255,0.8), 0 4px 12px rgba(164,185,212,0.4);
  letter-spacing: 12px;
  margin-bottom: 4px;
  font-weight: 800;
}

.title-divider {
  width: 60px;
  height: 4px;
  background: var(--gold);
  margin: 0 auto 24px;
  border-radius: 2px;
}

@media (max-width: 480px) {
  .title-main {
    font-size: var(--text-2xl);
    letter-spacing: 4px;
  }
}

.title-motto {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  letter-spacing: 3px;
}

.menu-nav {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 380px;
  padding: 32px;
  background: var(--card-surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 60px rgba(30, 60, 120, 0.12), 0 4px 16px rgba(30, 60, 120, 0.08);
}

.menu-btn {
  font-size: var(--text-sm);
  padding: 14px 24px;
  letter-spacing: 4px;
  width: 100%;
  background: rgba(255, 255, 255, 0.55);
  color: var(--menu-btn-color);
}

.menu-footer {
  position: relative;
  z-index: 1;
  font-size: var(--text-xs);
  color: rgba(15, 42, 88, 0.5);
  letter-spacing: 2px;
}

.menu-footer-sep {
  margin: 0 6px;
}

.menu-footer-link {
  color: rgba(15, 42, 88, 0.5);
  text-decoration: underline;
  cursor: pointer;
}

.menu-footer-link:hover,
.menu-footer-link:focus-visible {
  color: var(--gold);
  text-shadow: var(--gold-shadow);
}
</style>
