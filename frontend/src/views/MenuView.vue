<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import ManualModal from '@/components/common/ManualModal.vue'

const router = useRouter()
const auth = useAuthStore()

const manualOpen = ref(false)

const mathGlyphs = [
  { text: '7', left: '7%', top: '78%', size: '34px', duration: '20s', delay: '-4s', drift: '18px', rotate: '-8deg' },
  { text: '+', left: '14%', top: '42%', size: '26px', duration: '24s', delay: '-16s', drift: '-24px', rotate: '12deg' },
  { text: 'x', left: '20%', top: '88%', size: '22px', duration: '18s', delay: '-9s', drift: '16px', rotate: '18deg' },
  { text: '12', left: '26%', top: '62%', size: '30px', duration: '28s', delay: '-20s', drift: '-18px', rotate: '-14deg' },
  { text: '=', left: '32%', top: '22%', size: '24px', duration: '22s', delay: '-5s', drift: '28px', rotate: '8deg' },
  { text: 'f(x)', left: '39%', top: '83%', size: '28px', duration: '26s', delay: '-14s', drift: '-22px', rotate: '-10deg' },
  { text: '3.14', left: '46%', top: '48%', size: '22px', duration: '19s', delay: '-11s', drift: '20px', rotate: '16deg' },
  { text: '-', left: '54%', top: '72%', size: '30px', duration: '25s', delay: '-7s', drift: '-26px', rotate: '-18deg' },
  { text: '9', left: '62%', top: '30%', size: '36px', duration: '21s', delay: '-17s', drift: '18px', rotate: '10deg' },
  { text: '/', left: '69%', top: '87%', size: '28px', duration: '27s', delay: '-12s', drift: '-20px', rotate: '20deg' },
  { text: '2^n', left: '76%', top: '55%', size: '24px', duration: '23s', delay: '-18s', drift: '26px', rotate: '-12deg' },
  { text: '0', left: '84%', top: '76%', size: '32px', duration: '18s', delay: '-3s', drift: '-18px', rotate: '14deg' },
  { text: '42', left: '90%', top: '36%', size: '26px', duration: '29s', delay: '-21s', drift: '22px', rotate: '-16deg' },
  { text: '*', left: '11%', top: '18%', size: '32px', duration: '20s', delay: '-13s', drift: '20px', rotate: '-20deg' },
  { text: '8', left: '57%', top: '12%', size: '24px', duration: '24s', delay: '-8s', drift: '-24px', rotate: '14deg' },
  { text: '<', left: '88%', top: '12%', size: '22px', duration: '26s', delay: '-15s', drift: '16px', rotate: '9deg' },
]
</script>

<template>
  <div class="menu-view">
    <div class="math-field" aria-hidden="true">
      <span
        v-for="(glyph, index) in mathGlyphs"
        :key="`${glyph.text}-${index}`"
        class="math-glyph"
        :style="{
          '--glyph-left': glyph.left,
          '--glyph-top': glyph.top,
          '--glyph-size': glyph.size,
          '--glyph-duration': glyph.duration,
          '--glyph-delay': glyph.delay,
          '--glyph-drift': glyph.drift,
          '--glyph-rotate': glyph.rotate,
        }"
      >{{ glyph.text }}</span>
    </div>

    <div class="menu-title">
      <h1 class="title-main">數學防線</h1>
      <h2 class="title-sub">Math Defense</h2>
      <div class="title-divider"></div>
      <p class="title-motto">數學即魔法，守護座標原點</p>
    </div>

    <nav class="menu-nav">
      <button v-if="auth.isStudent || auth.isTeacher || !auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'level-select' })">
        ▶ START GAME
      </button>
      <button class="btn menu-btn" @click="router.push({ name: 'leaderboard' })">
        ◈ RANKING
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'territory-list' })">
        ⚔ GRABBING TERRITORY
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'rankings' })">
        ◈ FULL RANKING
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'classes' })">
        ◆ CLASS MANAGEMENT
      </button>
      <button v-if="auth.isTeacher || auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'teacher-dashboard' })">
        ⬡ TEACHER DASHBOARD
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'profile' })">
        ⬡ {{ auth.user?.player_name }}
      </button>
      <button v-if="auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'admin-teachers' })">
        ✦ ADMIN PANEL
      </button>
      <button class="btn menu-btn" @click="manualOpen = true">
        ◇ MANUAL
      </button>
      <button class="btn menu-btn" @click="auth.isLoggedIn ? auth.logout() : router.push({ name: 'auth' })">
        {{ auth.isLoggedIn ? '⏻ LOG OUT' : '⬡ LOGIN / REGISTER' }}
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
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 32px 0;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 48px;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.55) 0%, transparent 70%),
    linear-gradient(160deg, #8aaecb 0%, #a4b9d4 45%, #b8cfe0 100%);
}

.math-field {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.math-glyph {
  position: absolute;
  left: var(--glyph-left);
  top: var(--glyph-top);
  color: rgba(15, 42, 88, 0.22);
  font-family: var(--font-mono);
  font-size: var(--glyph-size);
  font-weight: 700;
  line-height: 1;
  text-shadow: none;
  transform: translate3d(-50%, 0, 0) rotate(var(--glyph-rotate));
  animation: glyph-float var(--glyph-duration) linear infinite;
  animation-delay: var(--glyph-delay);
}

.math-glyph:nth-child(3n) {
  color: rgba(25, 65, 140, 0.17);
}

.math-glyph:nth-child(4n) {
  color: rgba(50, 90, 165, 0.14);
}

@keyframes glyph-float {
  0% {
    opacity: 0;
    transform: translate3d(-50%, 38px, 0) rotate(var(--glyph-rotate));
  }
  12% {
    opacity: 1;
  }
  76% {
    opacity: 0.82;
  }
  100% {
    opacity: 0;
    transform: translate3d(calc(-50% + var(--glyph-drift)), -118vh, 0) rotate(calc(var(--glyph-rotate) + 34deg));
  }
}

.menu-title {
  position: relative;
  z-index: 1;
  text-align: center;
}

.title-main {
  font-size: 56px;
  color: var(--menu-navy);
  text-shadow: 0 2px 20px rgba(255,255,255,0.8), 0 4px 12px rgba(164,185,212,0.4);
  letter-spacing: 12px;
  margin-bottom: 4px;
  font-weight: 800;
}

.title-sub {
  font-size: 24px;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 16px;
  margin-bottom: 24px;
  font-weight: 300;
  text-transform: uppercase;
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
    font-size: 32px;
    letter-spacing: 4px;
  }
  .title-sub {
    font-size: 16px;
    letter-spacing: 6px;
  }
}

.title-motto {
  font-size: 12px;
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
  width: 320px;
  padding: 32px;
  background: var(--card-surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 60px rgba(30, 60, 120, 0.12), 0 4px 16px rgba(30, 60, 120, 0.08);
}

.menu-btn {
  font-size: 14px;
  padding: 14px 24px;
  letter-spacing: 4px;
  width: 100%;
  background: rgba(255, 255, 255, 0.55);
  color: var(--menu-btn-color);
}

.menu-footer {
  position: relative;
  z-index: 1;
  font-size: 10px;
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

@media (prefers-reduced-motion: reduce) {
  .math-glyph {
    animation: none;
    opacity: 0.42;
  }
}
</style>
