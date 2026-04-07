<script setup lang="ts">
/**
 * FourierPanel — 傅立葉護盾波形合成 UI
 * 3 個 sin 波分量（頻率/振幅），即時繪製合成波形。
 * Boss 戰 mini-game：調參數匹配目標波形。
 */
import { computed, ref, watch, onMounted } from 'vue'
import { fourierComposite, fourierMatch } from '@/math/WasmBridge'

const props = defineProps<{
  params: Record<string, number>
  targetFreqs?: number[]
  targetAmps?: number[]
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: number): void
  (e: 'match', score: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

const freqs = computed(() => [
  props.params.freq1 ?? 1,
  props.params.freq2 ?? 2,
  props.params.freq3 ?? 3,
])
const amps = computed(() => [
  props.params.amp1 ?? 1,
  props.params.amp2 ?? 0.5,
  props.params.amp3 ?? 0.3,
])

const matchScore = computed(() => {
  if (!props.targetFreqs || !props.targetAmps) return null
  return fourierMatch(freqs.value, amps.value, props.targetFreqs, props.targetAmps) * 100
})

watch(matchScore, (score) => {
  if (score !== null) emit('match', score)
})

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, 0, W, H)

  // Axes
  const midY = H / 2
  ctx.strokeStyle = '#3a3028'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, midY); ctx.lineTo(W, midY)
  ctx.stroke()

  const tMax = 2 * Math.PI
  const yScale = H / 12

  // Target wave (if boss mode)
  if (props.targetFreqs && props.targetAmps) {
    ctx.strokeStyle = 'rgba(200, 152, 72, 0.4)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    for (let px = 0; px < W; px++) {
      const t = (px / W) * tMax
      const y = fourierComposite(t, props.targetFreqs, props.targetAmps)
      const cy = midY - y * yScale
      if (px === 0) ctx.moveTo(px, cy)
      else ctx.lineTo(px, cy)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Individual components (faint)
  const componentColors = ['rgba(200, 80, 80, 0.3)', 'rgba(80, 200, 80, 0.3)', 'rgba(80, 80, 200, 0.3)']
  for (let c = 0; c < 3; c++) {
    ctx.strokeStyle = componentColors[c]
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let px = 0; px < W; px++) {
      const t = (px / W) * tMax
      const y = amps.value[c] * Math.sin(freqs.value[c] * t)
      const cy = midY - y * yScale
      if (px === 0) ctx.moveTo(px, cy)
      else ctx.lineTo(px, cy)
    }
    ctx.stroke()
  }

  // Composite wave
  ctx.strokeStyle = '#c89848'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let px = 0; px < W; px++) {
    const t = (px / W) * tMax
    const y = fourierComposite(t, freqs.value, amps.value)
    const cy = midY - y * yScale
    if (px === 0) ctx.moveTo(px, cy)
    else ctx.lineTo(px, cy)
  }
  ctx.stroke()
}

watch([freqs, amps], draw, { deep: true })
onMounted(draw)

const components = [
  { freq: 'freq1', amp: 'amp1', label: '\u03C91 / A\u2081', color: '#c85050' },
  { freq: 'freq2', amp: 'amp2', label: '\u03C92 / A\u2082', color: '#50c850' },
  { freq: 'freq3', amp: 'amp3', label: '\u03C93 / A\u2083', color: '#5050c8' },
]

function onInput(key: string, event: Event) {
  emit('update', key, parseFloat((event.target as HTMLInputElement).value) || 0)
}
</script>

<template>
  <div class="fourier-panel">
    <div class="fourier-label">
      Fourier Shield: \u03A3 A<sub>i</sub> sin(\u03C9<sub>i</sub> t)
    </div>

    <canvas ref="canvasRef" class="fourier-canvas" width="240" height="100" />

    <div v-if="matchScore !== null" class="match-display" :class="{ good: matchScore >= 70 }">
      Match: {{ matchScore.toFixed(0) }}%
      <span v-if="matchScore >= 70" class="match-ok">Shield Break!</span>
    </div>

    <div class="component-list">
      <div v-for="comp in components" :key="comp.freq" class="component-row">
        <span class="comp-dot" :style="{ background: comp.color }" />
        <span class="comp-label">{{ comp.label }}</span>
        <label class="slider-group">
          <span class="slider-label">\u03C9</span>
          <input
            type="range"
            class="fourier-slider"
            :value="params[comp.freq] ?? 1"
            min="0.1"
            max="10"
            step="0.1"
            @input="onInput(comp.freq, $event)"
          />
          <span class="slider-val">{{ (params[comp.freq] ?? 1).toFixed(1) }}</span>
        </label>
        <label class="slider-group">
          <span class="slider-label">A</span>
          <input
            type="range"
            class="fourier-slider"
            :value="params[comp.amp] ?? 0.5"
            min="0"
            max="5"
            step="0.1"
            @input="onInput(comp.amp, $event)"
          />
          <span class="slider-val">{{ (params[comp.amp] ?? 0.5).toFixed(1) }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fourier-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fourier-label {
  font-size: 10px;
  color: var(--axis);
  letter-spacing: 1px;
  text-align: center;
}

.fourier-canvas {
  border-radius: 4px;
  border: 1px solid var(--grid-line);
  width: 100%;
  height: auto;
}

.match-display {
  text-align: center;
  font-size: 12px;
  color: var(--axis);
  padding: 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}

.match-display.good {
  color: #50c850;
  background: rgba(80, 200, 80, 0.1);
}

.match-ok {
  font-weight: bold;
  margin-left: 6px;
}

.component-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.component-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.comp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.comp-label {
  font-size: 9px;
  color: var(--gold);
  width: 42px;
  flex-shrink: 0;
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.slider-label {
  font-size: 9px;
  color: var(--axis);
  font-style: italic;
  width: 10px;
}

.fourier-slider {
  flex: 1;
  min-width: 40px;
  accent-color: #c89848;
}

.slider-val {
  width: 26px;
  text-align: right;
  font-family: monospace;
  font-size: 9px;
  color: var(--gold);
}
</style>
