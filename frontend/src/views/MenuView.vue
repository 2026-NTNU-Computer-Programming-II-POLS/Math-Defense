<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()
</script>

<template>
  <div class="menu-view">
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px 0;
  overflow-y: auto;
  gap: 48px;
  background: var(--bg-base); /* theme-updated */
}

.menu-title {
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
}

.menu-footer {
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
</style>
