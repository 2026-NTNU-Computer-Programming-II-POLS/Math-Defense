<script setup lang="ts">
/**
 * IntegralPanel — Integral Cannon parameter input + integral area visualization
 * Live-renders the f(x) = ax² + bx + c curve and [a,b] integral region,
 * and displays the area computed by numericalIntegrate() as the damage value.
 */
import { computed, watch, onUnmounted } from 'vue'
import { numericalIntegrate } from '@/math/WasmBridge'
import { useCanvasPlot } from '@/composables/useCanvasPlot'

const props = defineProps<{
  params: Record<string, number>
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: number): void
}>()

const CANVAS_W = 240
const CANVAS_H = 130

const coeffA = computed(() => props.params.a ?? -0.5)
const coeffB = computed(() => props.params.b ?? 3)
const coeffC = computed(() => props.params.c ?? 2)
const intA = computed(() => props.params.intA ?? 0)
const intB = computed(() => props.params.intB ?? 6)

const area = computed(() =>
  numericalIntegrate(coeffA.value, coeffB.value, coeffC.value, intA.value, intB.value),
)

function f(x: number): number {
  return coeffA.value * x * x + coeffB.value * x + coeffC.value
}

function drawPlot(ctx: CanvasRenderingContext2D) {
  const W = CANVAS_W
  const H = CANVAS_H
  const pad = 10
  const plotW = W - pad * 2
  const plotH = H - pad * 2

  // Visible range: x from -2 to 26, y auto-scale
  const xMin = -2, xMax = 26
  let yMin = Infinity, yMax = -Infinity
  for (let px = 0; px <= plotW; px++) {
    const x = xMin + (px / plotW) * (xMax - xMin)
    const y = f(x)
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
  }
  // Add padding
  const yRange = Math.max(yMax - yMin, 1)
  yMin -= yRange * 0.1
  yMax += yRange * 0.1

  function toCanvas(x: number, y: number): [number, number] {
    return [
      pad + ((x - xMin) / (xMax - xMin)) * plotW,
      pad + ((yMax - y) / (yMax - yMin)) * plotH,
    ]
  }

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, 0, W, H)

  // Axis
  const [ax0, ay0] = toCanvas(0, 0)
  ctx.strokeStyle = '#3a3028'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, ay0); ctx.lineTo(W - pad, ay0)
  ctx.moveTo(ax0, pad); ctx.lineTo(ax0, H - pad)
  ctx.stroke()

  // Integral fill area
  const lo = Math.min(intA.value, intB.value)
  const hi = Math.max(intA.value, intB.value)
  ctx.fillStyle = 'rgba(74, 130, 200, 0.25)'
  ctx.beginPath()
  const [startX, startZero] = toCanvas(lo, 0)
  ctx.moveTo(startX, startZero)
  for (let px = 0; px <= 60; px++) {
    const x = lo + (px / 60) * (hi - lo)
    const [cx, cy] = toCanvas(x, f(x))
    ctx.lineTo(cx, cy)
  }
  const [endX, endZero] = toCanvas(hi, 0)
  ctx.lineTo(endX, endZero)
  ctx.closePath()
  ctx.fill()

  // Integral bounds lines
  ctx.strokeStyle = 'rgba(74, 130, 200, 0.6)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  const [laX] = toCanvas(lo, 0)
  ctx.beginPath(); ctx.moveTo(laX, pad); ctx.lineTo(laX, H - pad); ctx.stroke()
  const [lbX] = toCanvas(hi, 0)
  ctx.beginPath(); ctx.moveTo(lbX, pad); ctx.lineTo(lbX, H - pad); ctx.stroke()
  ctx.setLineDash([])

  // Curve
  ctx.strokeStyle = '#4a82c8'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let px = 0; px <= plotW; px++) {
    const x = xMin + (px / plotW) * (xMax - xMin)
    const [cx, cy] = toCanvas(x, f(x))
    if (px === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  }
  ctx.stroke()

  // Labels
  ctx.fillStyle = '#8b7342'
  ctx.font = '9px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`a=${lo}`, laX, H - 1)
  ctx.fillText(`b=${hi}`, lbX, H - 1)
}

// dpr: false keeps the stylesheet's `width: 100%` responsive sizing intact.
// `useCanvasPlot` only pins inline style dimensions when DPR scaling would
// otherwise blow up the backing store — opting out matches the original
// IntegralPanel behaviour (fixed 240×130 bitmap, CSS scales the display).
const { canvasRef, redraw } = useCanvasPlot({
  width: CANVAS_W,
  height: CANVAS_H,
  draw: drawPlot,
  dpr: false,
})
void canvasRef // template-only ref — vue-tsc TS6133 doesn't track destructured composable refs
// FourierPanel pattern: capture `stop` from watch(), tear down on unmount.
// Replaces the previous `mounted` ref guard (which could flip stale on a
// re-mounted keep-alive instance).
const stopWatch = watch([coeffA, coeffB, coeffC, intA, intB], redraw)
onUnmounted(stopWatch)

const paramFields = [
  { key: 'a', label: 'a (x\u00B2)', min: -5, max: 5, step: 0.1 },
  { key: 'b', label: 'b (x)', min: -10, max: 10, step: 0.1 },
  { key: 'c', label: 'c', min: -10, max: 10, step: 0.5 },
]

function onInput(key: string, event: Event) {
  const el = event.target as HTMLInputElement
  let val = parseFloat(el.value) || 0
  // Enforce min/max boundaries (HTML attributes are advisory only)
  const min = parseFloat(el.min)
  const max = parseFloat(el.max)
  if (!isNaN(min)) val = Math.max(val, min)
  if (!isNaN(max)) val = Math.min(val, max)
  emit('update', key, val)
}
</script>

<template>
  <div class="integral-panel">
    <div class="integral-label">Integral Cannon: \u222B<sub>a</sub><sup>b</sup> f(x) dx</div>

    <canvas ref="canvasRef" class="integral-canvas" :width="CANVAS_W" :height="CANVAS_H" />

    <div class="coeff-row">
      <label v-for="pf in paramFields" :key="pf.key" class="coeff-field">
        <span class="coeff-label">{{ pf.label }}</span>
        <input
          type="number"
          class="rune-input coeff-input"
          :value="params[pf.key] ?? 0"
          :min="pf.min"
          :max="pf.max"
          :step="pf.step"
          @input="onInput(pf.key, $event)"
        />
      </label>
    </div>

    <div class="bounds-row">
      <label class="bounds-field">
        <span class="bounds-label">\u222B lower (a)</span>
        <input
          type="range"
          class="bounds-slider"
          :value="params.intA ?? 0"
          min="-5"
          max="25"
          step="0.5"
          @input="onInput('intA', $event)"
        />
        <span class="bounds-val">{{ (params.intA ?? 0).toFixed(1) }}</span>
      </label>
      <label class="bounds-field">
        <span class="bounds-label">\u222B upper (b)</span>
        <input
          type="range"
          class="bounds-slider"
          :value="params.intB ?? 6"
          min="-5"
          max="25"
          step="0.5"
          @input="onInput('intB', $event)"
        />
        <span class="bounds-val">{{ (params.intB ?? 6).toFixed(1) }}</span>
      </label>
    </div>

    <div class="area-display">
      Area = <strong>{{ area.toFixed(1) }}</strong>
      <span class="area-hint">(= damage per hit)</span>
    </div>
  </div>
</template>

<style scoped>
.integral-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.integral-label {
  font-size: 10px;
  color: var(--axis);
  letter-spacing: 1px;
  text-align: center;
}

.integral-canvas {
  border-radius: 4px;
  border: 1px solid var(--grid-line);
  width: 100%;
  height: auto;
}

.coeff-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.coeff-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.coeff-label {
  font-size: 9px;
  color: var(--gold);
  font-style: italic;
}

.coeff-input {
  width: 52px;
  text-align: center;
  font-size: 12px;
}

.bounds-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bounds-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}

.bounds-label {
  width: 70px;
  color: var(--axis);
  font-size: 9px;
}

.bounds-slider {
  flex: 1;
  accent-color: #4a82c8;
}

.bounds-val {
  width: 32px;
  text-align: right;
  color: var(--gold);
  font-family: monospace;
  font-size: 10px;
}

.area-display {
  text-align: center;
  font-size: 11px;
  color: #4a82c8;
}

.area-hint {
  font-size: 9px;
  color: var(--axis);
  margin-left: 4px;
}
</style>
