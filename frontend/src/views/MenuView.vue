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
      <div class="logo-ring menu-logo-ring">
        <span class="logo-cardinal logo-cardinal-n" aria-hidden="true">✦</span>
        <span class="logo-cardinal logo-cardinal-e" aria-hidden="true">◆</span>
        <span class="logo-cardinal logo-cardinal-s" aria-hidden="true">✦</span>
        <span class="logo-cardinal logo-cardinal-w" aria-hidden="true">◆</span>
        <img
          class="logo-ring__img menu-logo"
          src="/logo.png"
          alt="Math Defense"
          width="1069"
          height="1389"
        />
      </div>
      <p class="motto">Let the numbers fall like rain of war — the node is mine forevermore.</p>
    </div>

    <div class="card card-ornate menu-card">
      <span class="card-corner card-corner-tl" aria-hidden="true"></span>
      <span class="card-corner card-corner-tr" aria-hidden="true"></span>
      <span class="card-corner card-corner-bl" aria-hidden="true"></span>
      <span class="card-corner card-corner-br" aria-hidden="true"></span>
      <button
        v-if="auth.isStudent || auth.isTeacher || !auth.isLoggedIn"
        class="btn btn-primary"
        @click="router.push({ name: 'level-select' })"
      >
        <span class="icon">▶</span><span class="label">Start Game</span>
      </button>

      <div
        v-if="auth.isStudent || auth.isTeacher"
        class="menu-section"
      >
        <div class="section-label">Progression</div>
        <div class="btn-stack">
          <button class="btn" @click="router.push({ name: 'achievements' })">
            <span class="icon">★</span><span class="label">Achievements</span>
          </button>
          <button class="btn" @click="router.push({ name: 'talents' })">
            <span class="icon">⬢</span><span class="label">Talent Tree</span>
          </button>
        </div>
      </div>

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
            <button
              class="btn btn-ghost account-btn"
              @click="router.push({ name: 'profile' })"
            >
              Open
            </button>
            <button class="btn account-btn" @click="auth.logout()">
              <span class="icon">⏻</span><span class="label">Log Out</span>
            </button>
          </div>
        </template>
        <div v-else class="btn-stack">
          <button class="btn" @click="router.push({ name: 'auth' })">
            <span class="icon">⬡</span><span class="label">Log In / Register</span>
          </button>
        </div>
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
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* The .logo-ring magic-circle + .card-ornate / .card-corner brackets
   are shared primitives in global.css. Only menu-specific sizing lives
   here. */
.menu-logo-ring {
  margin-bottom: 14px;
}

.menu-logo {
  width: 110px;
  height: auto;
  max-width: 36vw;
}

/* `.card`, `.motto` and the `.btn` family are shared primitives in
   global.css (review §3.1). `.section-label` stays scoped — the name
   collides with a plainer in-canvas label of the same name. */

.menu-card {
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

/* The first .section-label inside each .menu-section has margin-top: 0,
   so the Start Game button would otherwise sit flush against "PROGRESSION".
   Restore a breathing gap that matches the inter-section spacing. */
.menu-card > .btn.btn-primary {
  width: 100%;
  margin-bottom: 22px;
}

/* Menu nav buttons: icon pinned to the left (inset from the edge) while the
   label stays centred across the full button width. */
.menu-card .btn-stack > .btn {
  justify-content: center;
  position: relative;
}

.menu-card .btn-stack > .btn .icon {
  position: absolute;
  left: var(--space-12);
  top: 50%;
  transform: translateY(-50%);
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

/* Open + Log Out sit side by side at the right of the account row, sized
   down from the standard ghost button to keep the row compact. */
.account-btn {
  min-height: 32px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}

.account-btn .icon {
  font-size: var(--text-xs);
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
