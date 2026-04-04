<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore'

const uiStore = useUiStore()
</script>

<template>
  <div class="modal-overlay" @click.self="uiStore.closeModal">
    <div class="modal-box rune-panel">
      <h3 class="modal-title">{{ uiStore.modalTitle }}</h3>
      <p class="modal-message">{{ uiStore.modalMessage }}</p>
      <button class="btn modal-ok" @click="uiStore.closeModal">確認</button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-box {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}

.modal-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
}

.modal-message {
  font-size: 12px;
  color: #e8dcc8;
  line-height: 1.8;
}

.modal-ok { align-self: center; min-width: 120px; }
</style>
