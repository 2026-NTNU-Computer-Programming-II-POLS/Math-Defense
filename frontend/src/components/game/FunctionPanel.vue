<script setup lang="ts">
/**
 * FunctionPanel — piecewise-path HUD widget (construction plan P5-T5).
 *
 * Dumb SFC. Reads `gameStore.pathPanel` and writes `uiStore` hover state;
 * contains no domain or engine imports. The store is populated by
 * `projectPathPanel` in the engine layer; segment math is prebaked into
 * `PathSegmentView` records so this file never reaches into `SegmentedPath`.
 */
import { computed, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useCanvasPlot } from '@/composables/useCanvasPlot'

const gameStore = useGameStore()
const uiStore = useUiStore()

const panel = computed(() => gameStore.pathPanel)
const segments = computed(() => panel.value.segments)
const currentId = computed(() => panel.value.currentSegmentId)
const leadX = computed(() => panel.value.leadEnemyX)

const current = computed(() =>
  segments.value.find((s) => s.id === currentId.value) ?? null,
)

const visible = computed(() => segments.value.length > 0)
// When BuildPanel is open it docks to the same right rail; collapse the
// function panel into a single-line strip so the two never fight for the
// mid-column vertical band (audit C-2).
const compact = computed(() => uiStore.buildPanelVisible)

const PLOT_W = 200
const PLOT_H = 120

// Panel never evaluates segment math itself — the projection pre-samples
// points on the domain closure (see `projectPathPanel`), so `seg.samples`
// is the authoritative shape data and this SFC stays pure presentation.

function drawPlot(ctx: CanvasRenderingContext2D): void {
  // Phase 8 polish: the 1px axis stroke is pixel-snapped below (round+0.5)
  // so it lands on a single device row instead of smearing across two; the
  // curve uses rounded caps/joins (set below) so the polyline stays smooth
  // without anti-aliasing artefacts at shallow slopes.
  ctx.clearRect(0, 0, PLOT_W, PLOT_H)

  const seg = current.value
  if (!seg) return
  const pts = seg.samples
  if (pts.length === 0) return

  const [xLo, xHi] = seg.xRange
  const xSpan = xHi - xLo || 1

  // Auto-scale Y from sampled range with a small padding so flat lines
  // still render mid-canvas.
  let yMin = Infinity
  let yMax = -Infinity
  for (const p of pts) {
    if (p.y < yMin) yMin = p.y
    if (p.y > yMax) yMax = p.y
  }
  if (!isFinite(yMin) || !isFinite(yMax)) { yMin = -1; yMax = 1 }
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const pad = (yMax - yMin) * 0.15
  yMin -= pad
  yMax += pad
  const ySpan = yMax - yMin

  const marginX = 8
  const marginY = 8
  const toPxX = (x: number) => ((x - xLo) / xSpan) * (PLOT_W - 2 * marginX) + marginX
  // Canvas y grows downward; invert so higher y renders higher on screen.
  const toPxY = (y: number) => PLOT_H - marginY - ((y - yMin) / ySpan) * (PLOT_H - 2 * marginY)

  // Zero axis (if 0 falls inside the Y range). The 0.5 y-offset snaps the
  // 1px stroke onto a single pixel row so it renders as a clean hairline.
  if (yMin <= 0 && yMax >= 0) {
    ctx.strokeStyle = 'rgba(139, 115, 66, 0.5)'
    ctx.lineWidth = 1
    const zy = Math.round(toPxY(0)) + 0.5
    ctx.beginPath()
    ctx.moveTo(marginX, zy)
    ctx.lineTo(PLOT_W - marginX, zy)
    ctx.stroke()
  }

  // Curve — rounded caps/joins soften the polyline without relying on
  // imageSmoothing (which was disabled above for axis crispness).
  ctx.strokeStyle = '#4a82c8'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const px = toPxX(p.x)
    const py = toPxY(p.y)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Lead-enemy marker — only draw when the lead is within this segment.
  // Linearly interpolate y between adjacent samples so the dot tracks the
  // curve between sample points without re-evaluating the math.
  const lead = leadX.value
  if (lead >= xLo && lead <= xHi && pts.length >= 2) {
    let leadY = pts[0]!.y
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      if (lead <= b.x) {
        const span = b.x - a.x
        const t = span === 0 ? 0 : (lead - a.x) / span
        leadY = a.y + (b.y - a.y) * t
        break
      }
    }
    const px = toPxX(lead)
    const py = toPxY(leadY)
    ctx.fillStyle = '#ffd700'
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

// `flush: 'post'` — draw needs the canvas in the DOM. The first time
// segments populate (panel was hidden via `v-if`), the canvas is only
// attached after Vue flushes the render, so pre-flush watchers would see
// a stale null ref.
//
// leadX updates can fire more often than frame rate when the store batches
// store pushes, so coalesce redraws through rAF — at most one repaint per
// frame regardless of how many ticks land in between (useCanvasPlot.redraw).
const { canvasRef, draw, redraw } = useCanvasPlot({
  width: PLOT_W,
  height: PLOT_H,
  draw: drawPlot,
})
void canvasRef // template-only ref — vue-tsc TS6133 doesn't track destructured composable refs

watch(currentId, () => draw(), { flush: 'post' })
watch(leadX, () => redraw(), { flush: 'post' })
watch(visible, (v) => { if (v) draw() }, { flush: 'post' })

function segmentStatus(id: string): 'active' | 'past' | 'upcoming' {
  const curId = currentId.value
  if (id === curId) return 'active'
  if (!curId) return 'upcoming'
  const curIdx = segments.value.findIndex((s) => s.id === curId)
  const idx = segments.value.findIndex((s) => s.id === id)
  if (curIdx < 0 || idx < 0) return 'upcoming'
  // Segments are authored ascending in x. Enemies spawn at `startX` (the
  // rightmost edge = highest-index segment) and walk toward `targetX`
  // (leftmost = index 0). So segments with higher index than the current
  // lead segment have already been crossed ("past"); lower-index segments
  // are yet to come ("upcoming"). See segmented-path.ts for the direction
  // convention.
  return idx > curIdx ? 'past' : 'upcoming'
}

function onHover(id: string): void {
  uiStore.setHoveredSegmentId(id)
}
function onUnhover(): void {
  uiStore.setHoveredSegmentId(null)
}
</script>

<template>
  <aside
    v-if="visible"
    :class="['fn-panel', { 'fn-panel-compact': compact }]"
    aria-label="Path function panel"
  >
    <header class="fn-header">
      <span class="fn-title">Function</span>
      <span class="fn-current-label">{{ current?.label ?? '—' }}</span>
    </header>

    <div class="fn-expr" data-testid="fn-expr">{{ current?.expr ?? '' }}</div>

    <canvas
      ref="canvasRef"
      class="fn-plot"
      :width="PLOT_W"
      :height="PLOT_H"
      aria-hidden="true"
    />

    <ul class="fn-segments" data-testid="fn-segments">
      <li
        v-for="seg in segments"
        :key="seg.id"
        :class="['fn-seg', `fn-seg-${segmentStatus(seg.id)}`]"
        :data-segment-id="seg.id"
        @mouseenter="onHover(seg.id)"
        @mouseleave="onUnhover"
        @focus="onHover(seg.id)"
        @blur="onUnhover"
        tabindex="0"
      >
        <span class="fn-seg-label">{{ seg.label }}</span>
        <span class="fn-seg-expr">{{ seg.expr }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.fn-panel {
  position: absolute;
  right: 16px;
  top: 100px;
  width: 232px;
  background: rgba(26, 21, 32, 0.92);
  border: 1px solid var(--panel-border, #3a3028);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: var(--font-mono, monospace);
  color: #e8dcc8;
  z-index: var(--z-hints);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fn-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.fn-title {
  font-size: 11px;
  color: var(--axis, #8b7342);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.fn-current-label {
  font-size: 12px;
  color: var(--gold-bright, #d4a840);
  font-weight: bold;
}

.fn-expr {
  font-size: 13px;
  line-height: 1.25;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
  color: #4a82c8;
  min-height: 18px;
  /* T-4: `break-all` splits tokens like `sin(` mid-token. A monospace
     expression reads best as a single line that scrolls on overflow; fall
     back to word-level breaking for very long identifiers. */
  overflow-x: auto;
  white-space: nowrap;
  overflow-wrap: break-word;
}

.fn-plot {
  display: block;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(139, 115, 66, 0.25);
  border-radius: 3px;
}

.fn-segments {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 115, 66, 0.5) transparent;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.fn-segments::-webkit-scrollbar {
  width: 6px;
}
.fn-segments::-webkit-scrollbar-track {
  background: transparent;
}
.fn-segments::-webkit-scrollbar-thumb {
  background: rgba(139, 115, 66, 0.45);
  border-radius: 3px;
}
.fn-segments::-webkit-scrollbar-thumb:hover {
  background: rgba(212, 168, 64, 0.7);
}

.fn-seg {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  font-size: 11px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  border-radius: 3px;
  cursor: default;
  outline: none;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}

.fn-seg:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(255, 215, 0, 0.6);
}

.fn-seg:hover,
.fn-seg:focus {
  background: rgba(255, 215, 0, 0.08);
}

.fn-seg-active {
  background: rgba(255, 215, 0, 0.15);
  color: var(--gold-bright, #d4a840);
}

.fn-seg-past {
  color: #6c6050;
  text-decoration: line-through;
}

.fn-seg-upcoming {
  color: #b5a586;
}

.fn-seg-label {
  flex: 0 0 auto;
  font-weight: bold;
}

.fn-seg-expr {
  flex: 1 1 auto;
  text-align: right;
  color: inherit;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Reactive collapse when BuildPanel is open — shares the narrow-strip
   presentation below so the two panels never fight for the right rail
   (audit C-2). */
.fn-panel-compact {
  flex-direction: row;
  align-items: center;
  width: auto;
  max-width: calc(100% - 32px);
  top: 100px;
  padding: 6px 10px;
  gap: 12px;
}
.fn-panel-compact .fn-plot,
.fn-panel-compact .fn-segments {
  display: none;
}
.fn-panel-compact .fn-expr {
  min-height: 0;
}

/* Tablet band (R-2): 600–1200px keeps the vertical layout with plot +
   segments visible, just narrower so the panel stops fighting the canvas
   for horizontal space. */
@media (max-width: 1200px) and (min-width: 601px) {
  .fn-panel {
    width: 200px;
    padding: 8px 10px;
    gap: 6px;
  }
  .fn-segments {
    max-height: 110px;
  }
}

/* Phone band (R-2, spec §9.4 / P5-T8): below 600px the panel flattens
   into a single strip pinned to the top of the canvas so it doesn't
   swallow half the playfield. */
@media (max-width: 600px) {
  .fn-panel {
    flex-direction: row;
    align-items: center;
    width: auto;
    max-width: calc(100vw - 32px);
    top: 100px;
    padding: 6px 10px;
    gap: 12px;
  }
  .fn-plot,
  .fn-segments {
    display: none;
  }
  .fn-expr {
    min-height: 0;
  }
}
</style>
