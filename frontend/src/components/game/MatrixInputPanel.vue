<script setup lang="ts">
/**
 * MatrixInputPanel — 2x2 矩陣視覺化輸入
 * 以矩陣格式排列 4 個輸入欄，即時顯示行列式值。
 * 呼叫 WasmBridge.matrixMultiply() 驗證結果。
 */
import { computed } from 'vue'
import { matrixMultiply } from '@/math/WasmBridge'

const props = defineProps<{
  params: Record<string, number>
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: number): void
}>()

const det = computed(() => {
  const { a00 = 1, a01 = 0, a10 = 0, a11 = 1 } = props.params
  return a00 * a11 - a01 * a10
})

const transformPreview = computed(() => {
  const { a00 = 1, a01 = 0, a10 = 0, a11 = 1 } = props.params
  // Transform unit vectors [1,0] and [0,1]
  const result = matrixMultiply([a00, a01, a10, a11], [1, 0, 0, 1])
  return {
    e1: { x: result[0], y: result[2] },
    e2: { x: result[1], y: result[3] },
  }
})

function onInput(key: string, event: Event) {
  const val = parseFloat((event.target as HTMLInputElement).value) || 0
  emit('update', key, Math.max(-5, Math.min(5, val)))
}

const fields = [
  { key: 'a00', row: 0, col: 0, label: 'a\u2081\u2081' },
  { key: 'a01', row: 0, col: 1, label: 'a\u2081\u2082' },
  { key: 'a10', row: 1, col: 0, label: 'a\u2082\u2081' },
  { key: 'a11', row: 1, col: 1, label: 'a\u2082\u2082' },
]
</script>

<template>
  <div class="matrix-panel">
    <div class="matrix-label">Linear Transform Matrix</div>

    <div class="matrix-grid">
      <span class="bracket left">[</span>
      <div class="matrix-cells">
        <div v-for="field in fields" :key="field.key" class="matrix-cell">
          <input
            type="number"
            class="rune-input matrix-input"
            :value="params[field.key] ?? (field.key === 'a00' || field.key === 'a11' ? 1 : 0)"
            min="-5"
            max="5"
            step="0.1"
            @input="onInput(field.key, $event)"
          />
          <span class="cell-label">{{ field.label }}</span>
        </div>
      </div>
      <span class="bracket right">]</span>
    </div>

    <div class="matrix-info">
      <span class="det" :class="{ zero: Math.abs(det) < 0.01 }">
        det = {{ det.toFixed(2) }}
      </span>
      <span class="damage-hint">
        {{ Math.abs(det) < 0.01 ? '(singular - no damage)' : `damage x${Math.max(Math.abs(det), 0.5).toFixed(1)}` }}
      </span>
    </div>

    <svg class="transform-preview" viewBox="-6 -6 12 12" width="120" height="120">
      <line x1="-5" y1="0" x2="5" y2="0" stroke="#3a3028" stroke-width="0.1" />
      <line x1="0" y1="-5" x2="0" y2="5" stroke="#3a3028" stroke-width="0.1" />
      <!-- Original unit vectors -->
      <line x1="0" y1="0" x2="1" y2="0" stroke="#555" stroke-width="0.15" stroke-dasharray="0.2" />
      <line x1="0" y1="0" x2="0" y2="1" stroke="#555" stroke-width="0.15" stroke-dasharray="0.2" />
      <!-- Transformed vectors -->
      <line x1="0" y1="0" :x2="transformPreview.e1.x" :y2="-transformPreview.e1.y" stroke="#9068c8" stroke-width="0.2" />
      <line x1="0" y1="0" :x2="transformPreview.e2.x" :y2="-transformPreview.e2.y" stroke="#c89848" stroke-width="0.2" />
      <circle :cx="transformPreview.e1.x" :cy="-transformPreview.e1.y" r="0.2" fill="#9068c8" />
      <circle :cx="transformPreview.e2.x" :cy="-transformPreview.e2.y" r="0.2" fill="#c89848" />
    </svg>
  </div>
</template>

<style scoped>
.matrix-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.matrix-label {
  font-size: 10px;
  color: var(--axis);
  letter-spacing: 1px;
}

.matrix-grid {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bracket {
  font-size: 48px;
  color: #9068c8;
  font-weight: 100;
  line-height: 1;
}

.matrix-cells {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.matrix-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.matrix-input {
  width: 56px;
  text-align: center;
  font-size: 13px;
}

.cell-label {
  font-size: 9px;
  color: var(--gold);
  font-style: italic;
}

.matrix-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.det {
  font-size: 11px;
  color: #9068c8;
  font-family: monospace;
}

.det.zero {
  color: var(--enemy-red, #b84040);
}

.damage-hint {
  font-size: 9px;
  color: var(--axis);
}

.transform-preview {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border: 1px solid var(--grid-line);
}
</style>
