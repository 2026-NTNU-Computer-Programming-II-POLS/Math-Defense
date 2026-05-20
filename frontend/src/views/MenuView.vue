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
    <div class="menu-hero">
      <span class="title-eyebrow">FINAL PROJECT · 2026</span>
      <h1 class="title-main">Math Defense</h1>
      <div class="title-divider"></div>
      <p class="motto">Math is magic — defend the origin.</p>
    </div>

    <div class="card menu-card">
      <button
        v-if="auth.isStudent || auth.isTeacher || !auth.isLoggedIn"
        class="btn btn-primary"
        @click="router.push({ name: 'level-select' })"
      >
        <span class="icon">▶</span><span class="label">Start Game</span>
      </button>

      <div class="menu-section">
        <div class="section-label">Compete</div>
        <div class="btn-stack">
          <button class="btn" @click="router.push({ name: 'leaderboard' })">
            <span class="icon">◈</span><span class="label">Leaderboard</span>
          </button>
          <button
            v-if="auth.isLoggedIn"
            class="btn"
            @click="router.push({ name: 'rankings' })"
          >
            <span class="icon">◈</span><span class="label">Full Rankings</span>
          </button>
          <button
            v-if="auth.isLoggedIn"
            class="btn"
            @click="router.push({ name: 'territory-list' })"
          >
            <span class="icon">⚔</span><span class="label">Claim Territory</span>
          </button>
        </div>
      </div>

      <div v-if="auth.isLoggedIn" class="menu-section">
        <div class="section-label">Classroom</div>
        <div class="btn-stack">
          <button class="btn" @click="router.push({ name: 'classes' })">
            <span class="icon">◆</span><span class="label">Class Management</span>
          </button>
          <button
            v-if="auth.isTeacher || auth.isAdmin"
            class="btn"
            @click="router.push({ name: 'teacher-dashboard' })"
          >
            <span class="icon">⬡</span><span class="label">Teacher Dashboard</span>
          </button>
          <button
            v-if="auth.isAdmin"
            class="btn"
            @click="router.push({ name: 'admin-teachers' })"
          >
            <span class="icon">✦</span><span class="label">Admin Panel</span>
          </button>
        </div>
      </div>

      <div class="menu-section">
        <div class="section-label">Help</div>
        <div class="btn-stack">
          <button class="btn" @click="manualOpen = true">
            <span class="icon">◇</span><span class="label">Manual</span>
          </button>
        </div>
      </div>

      <div class="menu-section">
        <div class="section-label">Account</div>
        <template v-if="auth.isLoggedIn">
          <div class="account-row">
            <div class="avatar-sm">
              {{ (auth.user?.player_name || '?').slice(0, 2).toUpperCase() }}
            </div>
            <div class="account-meta">
              <div class="account-name">{{ auth.user?.player_name }}</div>
              <div class="account-sub">Player Profile</div>
            </div>
            <button class="btn btn-ghost" @click="router.push({ name: 'profile' })">
              Open
            </button>
          </div>
          <button class="btn" @click="auth.logout()">
            <span class="icon">⏻</span><span class="label">Log Out</span>
          </button>
        </template>
        <button
          v-else
          class="btn"
          @click="router.push({ name: 'auth' })"
        >
          <span class="icon">⬡</span><span class="label">Log In / Register</span>
        </button>
      </div>
    </div>

    <ManualModal :open="manualOpen" mode="full" @close="manualOpen = false" />

    <footer class="footer menu-footer">
      <span>Computer Programming (II) Final Project · 2026</span>
      <span class="menu-footer-sep">·</span>
      <a
        class="menu-footer-link"
        href="#"
        @click.prevent="router.push({ name: 'about' })"
      >Accessibility Statement</a>
    </footer>
  </div>
</template>

<style scoped>
.menu-view {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 48px 20px;
}

/* ── Title block ── */
.menu-hero {
  text-align: center;
  margin-bottom: 28px;
}

.title-eyebrow {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 5px;
  color: var(--terracotta-deep);
  padding: 5px 12px;
  border: 1px solid rgba(111, 138, 161, 0.5);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
}

.title-main {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--charcoal);
  letter-spacing: 5px;
  line-height: 1.1;
  margin-top: 14px;
}

.title-divider {
  width: 64px;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--terracotta), transparent);
  margin: 14px auto;
  border-radius: 2px;
}

/* `.card`, `.motto` and the `.btn` family are shared primitives in
   global.css (review §3.1). `.section-label` stays scoped — the name
   collides with a plainer in-canvas label of the same name. */

.menu-card {
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

/* ── Sections ── */
.menu-section + .menu-section {
  border-top: 1px dashed var(--line-strong);
  padding-top: 14px;
  margin-top: 18px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 4px;
  color: var(--charcoal-soft);
  text-transform: uppercase;
  margin: 22px 0 12px;
}

.section-label::after {
  content: "";
  flex: 1;
  height: 0;
  border-top: 1px dashed var(--line-strong);
}

.section-label:first-child {
  margin-top: 0;
}

/* ── Account row ── */
.account-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.avatar-sm {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--terracotta), var(--terracotta-soft));
  color: #fff;
  font-family: var(--font-mono);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.account-meta {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-weight: 600;
}

.account-sub {
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
}

/* ── Footer ── */
.footer {
  margin-top: 40px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--muted);
  letter-spacing: 2px;
  text-align: center;
}

.menu-footer-sep {
  margin: 0 6px;
}

.menu-footer-link {
  color: var(--charcoal-soft);
  text-decoration: underline;
  cursor: pointer;
}

.menu-footer-link:hover,
.menu-footer-link:focus-visible {
  color: var(--terracotta-deep);
}
</style>
