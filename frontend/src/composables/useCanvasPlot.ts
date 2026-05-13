/**
 * useCanvasPlot — shared canvas-rendering scaffold for HUD plot panels.
 *
 * Handles the boilerplate common to FunctionPanel / IntegralPanel: DPR-aware
 * backing-store sizing, rAF-coalesced repaints (so watchers firing faster
 * than frame rate collapse into one draw), and lifecycle cleanup that
 * cancels any pending frame on unmount.
 *
 * The caller supplies a pure `draw(ctx)` fn that reads its own reactive
 * sources; the composable calls it on mount, whenever `redraw()` is
 * triggered, and on `flush: 'post'` so the canvas is guaranteed attached.
 */
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export interface UseCanvasPlotOptions {
  /** CSS width in px. */
  width: number
  /** CSS height in px. */
  height: number
  /**
   * Pure draw callback. Context transform is pre-applied for DPR, so the
   * callback works in CSS pixels; it is passed the raw 2d context so it
   * can paint without re-acquiring it.
   */
  draw: (ctx: CanvasRenderingContext2D) => void
  /** Respect DPR on hi-DPI screens. Defaults to true. */
  dpr?: boolean
}

export interface UseCanvasPlotResult {
  canvasRef: Ref<HTMLCanvasElement | null>
  /** Paint synchronously. Used by `onMounted` and explicit `redraw()`. */
  draw: () => void
  /** Coalesce any number of redraw requests into a single rAF-scheduled repaint. */
  redraw: () => void
}

export function useCanvasPlot(options: UseCanvasPlotOptions): UseCanvasPlotResult {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const useDpr = options.dpr !== false
  let rafId: number | null = null

  function draw(): void {
    const canvas = canvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = useDpr ? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) : 1
    if (canvas.width !== options.width * dpr) {
      canvas.width = options.width * dpr
      canvas.height = options.height * dpr
      canvas.style.width = `${options.width}px`
      canvas.style.height = `${options.height}px`
    }
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    options.draw(ctx)
  }

  function redraw(): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      draw()
    })
  }

  onMounted(draw)
  onBeforeUnmount(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return { canvasRef, draw, redraw }
}
