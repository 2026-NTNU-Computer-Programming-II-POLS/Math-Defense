<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()

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
        ▶ 開始遊戲
      </button>
      <button class="btn menu-btn" @click="router.push({ name: 'leaderboard' })">
        ◈ 排行榜
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'territory-list' })">
        ⚔ 搶佔領地
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'rankings' })">
        ◈ 完整排名
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'classes' })">
        ◆ 班級管理
      </button>
      <button v-if="auth.isTeacher || auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'teacher-dashboard' })">
        ⬡ 教師面板
      </button>
      <button v-if="auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'profile' })">
        ⬡ {{ auth.user?.player_name }}
      </button>
      <button v-if="auth.isAdmin" class="btn menu-btn" @click="router.push({ name: 'admin-teachers' })">
        ✦ 管理面板
      </button>
      <button class="btn menu-btn" @click="auth.isLoggedIn ? auth.logout() : router.push({ name: 'auth' })">
        {{ auth.isLoggedIn ? '⏻ 登出' : '⬡ 登入 / 註冊' }}
      </button>
    </nav>

    <footer class="menu-footer">
      <span>程式設計（二）期末專題 · 2026</span>
      <span class="menu-footer-sep">·</span>
      <a class="menu-footer-link" href="#" @click.prevent="router.push({ name: 'about' })">無障礙聲明</a>
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
  padding: 32px 0;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 48px;
  background: var(--bg-base);
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
  color: rgba(255, 228, 145, 0.34);
  font-family: var(--font-mono);
  font-size: var(--glyph-size);
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 0 16px rgba(255, 215, 0, 0.22);
  transform: translate3d(-50%, 0, 0) rotate(var(--glyph-rotate));
  animation: glyph-float var(--glyph-duration) linear infinite;
  animation-delay: var(--glyph-delay);
}

.math-glyph:nth-child(3n) {
  color: rgba(139, 191, 220, 0.32);
}

.math-glyph:nth-child(4n) {
  color: rgba(232, 220, 200, 0.24);
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
  color: white;
  text-shadow: 2px 2px 10px rgba(44, 62, 80, 0.2);
  letter-spacing: 12px;
  margin-bottom: 4px;
  font-weight: 800;
}

.title-sub {
  font-size: 24px;
  color: var(--gold);
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
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(15px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.05);
}

.menu-btn {
  font-size: 14px;
  padding: 14px 24px;
  letter-spacing: 4px;
  width: 100%;
  background: rgba(13, 10, 18, 0.58);
  backdrop-filter: blur(6px);
}

.menu-footer {
  position: relative;
  z-index: 1;
  font-size: 10px;
  color: var(--grid-line);
  letter-spacing: 2px;
}

.menu-footer-sep {
  margin: 0 6px;
}

.menu-footer-link {
  color: var(--grid-line);
  text-decoration: underline;
  cursor: pointer;
}

.menu-footer-link:hover,
.menu-footer-link:focus-visible {
  color: var(--gold);
}

@media (prefers-reduced-motion: reduce) {
  .math-glyph {
    animation: none;
    opacity: 0.42;
  }
}
</style>
