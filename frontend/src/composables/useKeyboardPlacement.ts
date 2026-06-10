/**
 * useKeyboardPlacement — Pedagogical Backlog §19 / WCAG 2.2 SC 2.1.1.
 *
 * Mouse-free build-phase navigation: arrow keys walk a focus cursor across
 * the LegalPositionSet, Enter places the held tower at the cursor (by
 * emitting CANVAS_CLICK so TowerPlacementSystem stays the single placement
 * authority), Tab cycles unlocked tower types, 1-7 picks a tower by index,
 * Esc cancels the held tower. Active only during BUILD; the cursor is
 * cleared on phase exit so it never renders during WAVE.
 *
 * The focus ring is **lazy + sticky** — on the first BUILD entry it stays
 * hidden, so pure-mouse players never see an accessibility indicator they
 * never asked for. The first arrow keydown flips a session-scoped opt-in
 * flag and seeds the cursor at the first legal position (via `moveCursor`'s
 * existing "press to seed" branch). Once opted in, subsequent BUILD entries
 * auto-restore the cursor so a keyboard player isn't forced to re-tap an
 * arrow at the start of every BUILD phase. The opt-in flag is closure-
 * scoped: it resets when the composable unmounts (e.g. leaving GameView)
 * but persists across LEVEL_START and BUILD↔WAVE cycles inside one run.
 *
 * This still satisfies SC 2.4.7 (focus is visible whenever a keyboard user
 * starts navigating) and SC 2.1.1 (every action remains keyboard-reachable).
 */
import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { Events, GamePhase, TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import {
  computeLegalPositions,
  type LegalPositionSet,
} from '@/domain/placement/legal-positions'
import { isGeneratedLevelContext, isPlacementConcealed } from '@/engine/generated-level-context'
import type { GameEvents } from '@/engine/Game'
import type { GameState } from '@/engine/GameState'
import type { LevelContext } from '@/engine/level-context'
import type { GeneratedLevelContext } from '@/engine/generated-level-context'

/**
 * The composable only touches the public surface of `Game`. Vue's
 * `UnwrapRef` deep-unwraps `Ref<Game>` into a structural shape that
 * drops the class's private fields, so `Pick<Game, …>` would not match
 * what flows out of `useGameLoop`. Declaring the surface with literal
 * member types keeps the parameter compatible with both the class and
 * the unwrapped form, and lets the §19 test stub stay honest.
 */
export type GameLike = {
  readonly eventBus: {
    on<K extends keyof GameEvents>(event: K, cb: (p: GameEvents[K]) => void): () => void
    emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void
  }
  state: GameState
  levelContext: LevelContext | GeneratedLevelContext | null
  hud: { keyboardCursor: { gx: number; gy: number } | null }
}

export interface KeyboardPlacementHandle {
  /** Synthetic keydown driver — exported for component tests. */
  handleKeydown(e: KeyboardEvent): void
}

export function useKeyboardPlacement(
  game: Ref<GameLike | null>,
): KeyboardPlacementHandle {
  const gameStore = useGameStore()
  const uiStore = useUiStore()
  let legal: LegalPositionSet | null = null
  const unsubs: (() => void)[] = []
  // Sticky opt-in: once the user has navigated with an arrow key during this
  // mount, treat them as a keyboard player for the remainder of the session
  // and auto-restore the focus ring on subsequent BUILD entries. Pure-mouse
  // players never flip this, so the ring stays invisible end-to-end.
  let keyboardOptIn = false

  function recomputeLegal(g: GameLike): void {
    const ctx = g.levelContext
    if (!ctx) { legal = null; return }
    if (isGeneratedLevelContext(ctx)) {
      // While the paths are hidden the arrow-key cursor walks the full
      // lattice (computeLegalPositions with no paths excludes nothing):
      // restricting it to legal positions would let a keyboard player trace
      // the hidden paths by watching which points the cursor skips. Enter on
      // a blocked point is rejected by TowerPlacementSystem as usual.
      legal = isPlacementConcealed(g)
        ? computeLegalPositions({ paths: [] })
        : computeLegalPositions({ paths: ctx.paths, decoyCells: ctx.decoyCells })
      return
    }
    legal = computeLegalPositions(ctx.path)
  }

  function ensureCursor(g: GameLike): void {
    if (g.hud.keyboardCursor !== null) return
    if (!legal || legal.positions.length === 0) return
    const [gx, gy] = legal.positions[0]
    g.hud.keyboardCursor = { gx, gy }
  }

  function moveCursor(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    const g = game.value
    if (!g || !legal || legal.positions.length === 0) return
    // First arrow keydown during this mount marks the player as a keyboard
    // user; subsequent BUILD entries will auto-restore the cursor.
    keyboardOptIn = true
    if (g.hud.keyboardCursor === null) { ensureCursor(g); return }
    const cur = g.hud.keyboardCursor

    let best: { gx: number; gy: number } | null = null
    let bestScore = Infinity
    for (const [gx, gy] of legal.positions) {
      const ddx = gx - cur.gx
      const ddy = gy - cur.gy
      if (ddx === 0 && ddy === 0) continue
      if (dx !== 0 && Math.sign(ddx) !== dx) continue
      if (dy !== 0 && Math.sign(ddy) !== dy) continue
      // Weight perpendicular drift heavily so the cursor prefers moving
      // along the requested axis before snapping diagonally to a row/column
      // that's spatially closer but visually misleading.
      const principal = dx !== 0 ? Math.abs(ddx) : Math.abs(ddy)
      const perpendicular = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx)
      const score = principal + perpendicular * 4
      if (score < bestScore) { bestScore = score; best = { gx, gy } }
    }
    if (best !== null) g.hud.keyboardCursor = best
  }

  function unlockedTowerTypes(): TowerType[] {
    return (Object.values(TOWER_DEFS) as TowerDefShape[])
      .filter((d) => d.unlockLevel <= gameStore.level)
      .map((d) => d.type)
  }

  function pickTowerByIndex(index: number): void {
    const list = unlockedTowerTypes()
    if (index < 0 || index >= list.length) return
    uiStore.selectTower(list[index])
  }

  function cycleTowerType(): void {
    const list = unlockedTowerTypes()
    if (list.length === 0) return
    const current = uiStore.selectedTowerType as TowerType | null
    const idx = current === null ? -1 : list.indexOf(current)
    const next = list[(idx + 1) % list.length]
    uiStore.selectTower(next)
  }

  function placeAtCursor(): void {
    const g = game.value
    if (!g || g.hud.keyboardCursor === null) return
    const { gx, gy } = g.hud.keyboardCursor
    g.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: gameToCanvasX(gx), y: gameToCanvasY(gy) },
      game:  { x: gx, y: gy },
    })
  }

  function handleKeydown(e: KeyboardEvent): void {
    const g = game.value
    if (!g) return
    if (g.state.phase !== GamePhase.BUILD) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    // When a button is focused (e.g. Start Wave, TowerBar item), let the
    // browser's native activation keys reach it. preventDefault'ing Enter
    // here would silently break "tab to Start Wave, press Enter" — the
    // very keyboard path §19 is supposed to enable.
    if (tag === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return

    switch (e.code) {
      case 'ArrowUp':    e.preventDefault(); moveCursor(0, 1);  break
      case 'ArrowDown':  e.preventDefault(); moveCursor(0, -1); break
      case 'ArrowLeft':  e.preventDefault(); moveCursor(-1, 0); break
      case 'ArrowRight': e.preventDefault(); moveCursor(1, 0);  break
      case 'Enter':      e.preventDefault(); placeAtCursor(); break
      case 'Escape':     uiStore.clearSelectedTower(); break
      case 'Tab':        e.preventDefault(); cycleTowerType(); break
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7':
        e.preventDefault()
        pickTowerByIndex(Number(e.code.slice(5)) - 1)
        break
    }
  }

  function attach(g: GameLike): void {
    detach()
    recomputeLegal(g)
    // Lazy reveal on first attach: cursor stays null until the first arrow
    // keydown (moveCursor seeds it). Once the player has opted in earlier in
    // this mount, restore the cursor immediately on BUILD-phase attaches.
    if (g.state.phase === GamePhase.BUILD && keyboardOptIn) ensureCursor(g)

    unsubs.push(g.eventBus.on(Events.LEVEL_START, () => {
      recomputeLegal(g)
      g.hud.keyboardCursor = null
      if (g.state.phase === GamePhase.BUILD && keyboardOptIn) ensureCursor(g)
    }))
    unsubs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ to }) => {
      if (to === GamePhase.BUILD) {
        recomputeLegal(g)
        if (keyboardOptIn) ensureCursor(g)
      } else {
        g.hud.keyboardCursor = null
      }
    }))
  }

  function detach(): void {
    unsubs.splice(0).forEach((fn) => { try { fn() } catch { /* idempotent teardown */ } })
  }

  watch(game, (g) => {
    if (g) attach(g)
    else detach()
  })

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    if (game.value) attach(game.value)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    detach()
    if (game.value) game.value.hud.keyboardCursor = null
    legal = null
  })

  return { handleKeydown }
}

interface TowerDefShape {
  readonly type: TowerType
  readonly unlockLevel: number
}
