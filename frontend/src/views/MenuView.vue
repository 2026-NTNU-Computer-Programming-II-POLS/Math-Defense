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
      <p class="title-motto">數學即魔法，守護座標原點</p>
    </div>

    <nav class="menu-nav">
      <button v-if="auth.isStudent || !auth.isLoggedIn" class="btn menu-btn" @click="router.push({ name: 'level-select' })">
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
  background: radial-gradient(ellipse at center, #1e1828 0%, #0d0a12 70%);
}

.menu-title {
  text-align: center;
}

.title-main {
  font-size: 48px;
  color: var(--gold-bright);
  text-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
  letter-spacing: 8px;
  margin-bottom: 8px;
}

.title-sub {
  font-size: 20px;
  color: var(--gold);
  letter-spacing: 12px;
  margin-bottom: 16px;
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
  gap: 12px;
  width: 280px;
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
</style>
