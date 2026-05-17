<template>
  <div class="app-shell">
    <slot />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  max-width: var(--shell-max-width, 1280px);
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 64px);
  background: transparent;
}
</style>
