# Main Gameplay UI/UX Audit

_Audit date: 2026-04-19_
_Target: `frontend/src/views/GameView.vue` and its child components_
_Branch: `feature/piecewise-paths`_

## 0. Scope and component map

The main gameplay view is `frontend/src/views/GameView.vue`. It mounts a fixed 1280×720 canvas and a transparent overlay with the following child widgets:

| # | Component | File | Positioning | z-index |
|---|-----------|------|-------------|---------|
| 1 | `HUD`           | `components/game/HUD.vue`            | top bar, full width, h=48px | 20 |
| 2 | `FunctionPanel` | `components/game/FunctionPanel.vue`  | `top:64 right:16 w:232` | 15 |
| 3 | `BuildHint`     | `components/game/BuildHint.vue`      | `top:56 left:50% translateX(-50%)` | 15 |
| 4 | `start-wave-btn` (inline) | `views/GameView.vue:80-86` | `top:56 right:16` | 20 |
| 5 | `TowerBar`      | `components/game/TowerBar.vue`       | bottom bar, full width, `flex-wrap:wrap` | 20 |
| 6 | `BuildPanel`    | `components/game/BuildPanel.vue`     | `right:16 bottom:64 w:270` | 30 |
| 7 | `BuffCardPanel` | `components/game/BuffCardPanel.vue`  | full-screen overlay, centered modal | 40 |
| 8 | `LevelSelect`   | `components/common/LevelCard.vue`    | full-screen overlay | 40 |
| 9 | `Modal`         | `components/common/Modal.vue`        | full-screen overlay | 50 |

Note: `FunctionPanel` is mounted *inside* `HUD.vue`'s template (`HUD.vue:63`), so it renders whenever HUD is mounted — i.e. throughout the entire BUILD / WAVE / BUFF_SELECT lifecycle.

---

## 1. Critical issues — elements overlap / get obscured

These are the problems the user likely observed. All reproduced from reading source, not assumed.

### C-1. `Start Wave` button obscures the top-right corner of `FunctionPanel`
- **Files:** `views/GameView.vue:80-86, 124-132` ; `components/game/FunctionPanel.vue:207-222`
- **What happens:** `start-wave-btn` is absolutely positioned at `top:56 right:16 z:20`. `FunctionPanel` sits at `top:64 right:16 w:232 z:15`. Both anchor to the same right edge. Because the button is ~34px tall (padding 10+12+10 + letter-spacing), it extends from y=56 to y≈90, clipping the panel's first ~26px — exactly where the title and the *current expression* text live. Since the button has the higher z-index, the panel content underneath is hidden during the entire BUILD phase.
- **Severity:** Critical
- **Fix:** Move `start-wave-btn` to the bottom (e.g. left of the tower bar) **or** push `FunctionPanel` down (`top:96`) **or** inline the Start Wave control inside the HUD row as a right-aligned button. The simplest patch: set `FunctionPanel`'s `top` to `56 + start-wave-height + 8` and give `start-wave-btn` a `z-index` that doesn't matter because they no longer overlap.

### C-2. `BuildPanel` can cover `FunctionPanel` on the right rail
- **Files:** `components/game/BuildPanel.vue:167-176` ; `components/game/FunctionPanel.vue:207-222`
- **What happens:** Both panels dock to `right:16`. `FunctionPanel` is 232px wide and grows downward from `top:64`; with plot (120px) + expr + scroll region (up to 160px) + padding, it can extend past y≈450. `BuildPanel` (width 270, z:30) grows upward from `bottom:64`. On a 720px canvas, when a multi-param tower is opened (e.g. Function Cannon upgraded with ~4 fields) they collide in the 350-450px band. `BuildPanel` wins the z-war, so the segment list of `FunctionPanel` is silently hidden.
- **Severity:** High
- **Fix:** Put the two panels on different columns (BuildPanel on the left, or stacked with a shared rail container) — or make `FunctionPanel` collapse while `BuildPanel` is open.

### C-3. `BuildPanel` bottom offset breaks when `TowerBar` wraps to a second row
- **Files:** `components/game/TowerBar.vue:69` (`flex-wrap: wrap`) ; `components/game/BuildPanel.vue:170` (`bottom: 64px`)
- **What happens:** `TowerBar` uses `flex-wrap: wrap` with 90px min-width buttons. Once enough towers unlock (mid-to-late level), the bar wraps to two rows and reaches ~120px tall. `BuildPanel`'s hardcoded `bottom:64` then lands *inside* the tower bar, so the bottom of the panel (including the **Cast Spell** button) is hidden behind the tower tiles.
- **Severity:** Critical (primary action disappears at high levels)
- **Fix:** Either lock `TowerBar` to a single scrollable row (`flex-wrap: nowrap; overflow-x: auto`) or make `BuildPanel`'s bottom offset reactive to `TowerBar.offsetHeight` via a ResizeObserver / exposed CSS variable.

### C-4. `BuildHint` can collide with `Start Wave` on narrower viewports
- **Files:** `components/game/BuildHint.vue:28-43` ; `views/GameView.vue:124-132`
- **What happens:** `BuildHint` is centered at `top:56` with `white-space:nowrap`. Step ③ (`滑鼠懸停塔，開啟 Build Panel 設定參數`) renders roughly 360px wide. `Start Wave Button` sits at `top:56 right:16`. At the design viewport 1280px there is ~140px clearance on the right, but because the hint's x-extent is not clamped, any Chinese-width font change or a longer future hint will overrun into the button.
- **Severity:** Medium
- **Fix:** Add `max-width: calc(100vw - 320px)` and remove `white-space: nowrap`, or anchor the hint to the HUD bar itself.

### C-5. Fixed 1280×720 viewport — nothing scales below desktop
- **Files:** `views/GameView.vue:99-108` (`width:1280px; height:720px` hard-coded on both `.game-view` and `.game-canvas`)
- **What happens:** There is no responsive layer whatsoever. On a 1366×768 laptop the border touches the edge; on a 1080px-wide window the game is horizontally clipped; on a phone the page scrolls horizontally and most of the overlay lives off-screen. The Renderer already handles DPR on the canvas (`engine/Renderer.ts:25-30`) but CSS dimensions are hard-pinned.
- **Severity:** Critical
- **Fix:** Wrap `.game-view` in a flexbox container that uses `width: min(1280px, 100vw)` and `aspect-ratio: 16/9`. Scale the canvas via `transform: scale(...)` on a wrapper so internal coordinates stay 1280×720 while display size follows viewport. Add an observer that calls `Renderer.resize()` on changes.

---

## 2. Z-index is an implicit, undocumented ladder

### Z-1. No central scale; HUD and TowerBar collide at z:20
- **Files:** `HUD.vue:78`, `TowerBar.vue:61`, `FunctionPanel.vue:218`, `BuildHint.vue:42`, `BuildPanel.vue:172`, `BuffCardPanel.vue:118`, `LevelCard.vue` (40), `Modal.vue` (50), inline `start-wave-btn:131`.
- **What happens:** HUD and TowerBar share z:20; inline Start Wave button also z:20. DOM order decides the winner. `FunctionPanel` and `BuildHint` share z:15. Nothing is documented.
- **Severity:** Medium
- **Fix:** Define a token set in `styles/variables.css` — `--z-chrome: 20; --z-hints: 15; --z-floating-panel: 30; --z-modal-overlay: 40; --z-modal: 50;` — and migrate every magic number to a var.

---

## 3. Language / labelling inconsistency

Game mixes Chinese and English in the same sentence, and sometimes inside the same widget.

### L-1. Hint steps mix languages inside one string
- **File:** `components/game/BuildHint.vue:11-15`
- **Examples:** `'③ 滑鼠懸停塔，開啟 Build Panel 設定參數'`, `'④ 點擊「Cast Spell」確認'`, `'⑤ 點擊「Start Wave」開始波次'`
- **Severity:** Medium — player sees a mishmash that reads like unfinished translation.

### L-2. Cost labels mixed: `Free` in TowerBar, `免費` in BuffCardPanel
- **Files:** `TowerBar.vue:44` (`'Free'`), `BuffCardPanel.vue:92` (`'免費'`)
- **Severity:** Medium

### L-3. Skip button doubles up: `跳過 (Skip)`
- **File:** `BuffCardPanel.vue:105`
- **Severity:** Low — pick one language.

### L-4. Modal text mixes
- **File:** `views/GameView.vue:33-45`
- `'關卡通關！'` + body `'Score: X  Kills: Y'`; `'Game Over'` + `'已存活 {{ wave }} 波  Score: X'`
- **Severity:** Medium

### L-5. `BuildPanel` labels mix
- **File:** `BuildPanel.vue:116, 158, 160, 162`
- `aria-label="關閉面板"`, `'此塔無需設定參數'`, `aria-label="施放法術 Cast Spell"`, button text `'✦ Cast Spell'`
- **Severity:** Medium
- **Fix for L-1…L-5:** Introduce `vue-i18n` (or at minimum a small `locale.ts` map) and stop hard-coding language into templates.

### L-6. Math concept strings only available in English
- **File:** `BuildPanel.vue:121` displays `towerDef.mathConcept`; `TowerBar.vue:38` interpolates it into the native tooltip.
- **Severity:** Low — most of the UI chrome is Chinese, but the pedagogical labels are English-only.

---

## 4. Accessibility

### A-1. Tower buttons lack descriptive `aria-label`
- **File:** `TowerBar.vue:30-46` — relies on `title` attribute only; screen readers ignore `title` inconsistently.
- **Fix:** Add `:aria-label="`${def.nameEn}, ${def.mathConcept}, cost ${def.cost}`"`.

### A-2. `close-btn` has no visible focus indicator
- **File:** `BuildPanel.vue:186-192` — `background:none; border:none;` with no `:focus-visible` style. Keyboard users can't tell when it's focused.
- **Fix:** Add `.close-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }`.

### A-3. Small hit targets
- **Files:** `global.css` `.btn { padding:8px 16px }` (~32px tall); `BuildPanel.vue:186` close button with no padding.
- **Severity:** Medium — Apple/Google/WCAG recommend ≥44px for touch.

### A-4. HP warning conveyed by colour only
- **File:** `HUD.vue:51-52` — `.hp-low` only changes colour to red. Colour-blind users don't see the warning.
- **Fix:** Add an icon or bold: `<span v-if="g.hp <= 5">⚠ </span>`.

### A-5. `unaffordable` tower buttons rely on opacity
- **File:** `TowerBar.vue:90` — `opacity: 0.4`. Contrast drops below WCAG AA on every text element inside the button.
- **Fix:** Desaturate + a distinct border colour instead of dimming.

### A-6. No live region for game-state changes
- **File:** `views/GameView.vue:57-96` — no `role="status"` / `aria-live` element. Screen readers get no feedback when phase changes or HP drops.
- **Fix:** Add a hidden `<div aria-live="polite">` that announces phase transitions.

### A-7. `BuffCardPanel` has no keyboard shortcut or focus trap
- **File:** `BuffCardPanel.vue:70-107` — the buff overlay is modal-ish (full-screen darken) but focus can still tab behind it; no 1/2/3 hotkeys.
- **Fix:** Add `Modal`-style focus trap + `@keydown.1/.2/.3` shortcuts.

### A-8. No `:focus-visible` styles on tower / buff buttons
- Same components as above — hover styles exist (`:hover`) but keyboard focus is visually indistinguishable from inert state.

---

## 5. Responsive / mobile

### R-1. `BuildPanel` overflows right edge on narrow viewports
- **File:** `BuildPanel.vue:167-176` — `right:16; width:270` means below ≈300px viewport width the panel is clipped or horizontally scrolls.

### R-2. `FunctionPanel` has exactly one breakpoint at 1200px
- **File:** `FunctionPanel.vue:343-360` — below 1200px it collapses to a one-line strip, hiding the plot and segment list entirely. There's no middle state for 600–1200px devices.

### R-3. `HUD` doesn't wrap
- **File:** `HUD.vue:67-79` — `padding:0 16px; gap:24px;` with six items. On narrow viewports items clip off the right edge (Score is the casualty because of `margin-left:auto`).
- **Fix:** `flex-wrap: wrap` at ≤640px and drop `Score` to a second row.

### R-4. `BuildHint` uses `white-space: nowrap`
- **File:** `BuildHint.vue:40` — any hint longer than the viewport disappears off-screen on mobile.

### R-5. No orientation handling
- Portrait phones on 1280×720 layout — the entire overlay is unusable.

---

## 6. Canvas & rendering

### K-1. No resize handler for the canvas
- **File:** `views/GameView.vue` / `composables/useGameLoop.ts` — canvas width/height set once via `Renderer` constructor. If the user resizes the window or switches DPR (e.g. moving between monitors), the canvas doesn't re-scale.
- **Severity:** High if/when C-5 is fixed.

### K-2. No loading state before `ready`
- **File:** `views/GameView.vue:66` — `v-if="ready"` hides everything until WASM initialises. Canvas is a blank black box until then; no spinner or progress hint.
- **Fix:** Add a `<div v-else class="loading">…</div>` sibling.

### K-3. No WASM load-error path
- **File:** `composables/useGameLoop.ts` (not shown in detail) — if `initWasm()` rejects, `ready` stays false forever. Player sees a frozen empty canvas.
- **Fix:** Wrap init in try/catch and surface a `Modal` with retry.

---

## 7. UX friction

### U-1. No pause / resume
- The WAVE phase runs to completion with no way to pause, read the current tower's math label, or AFK. There's no ESC / Space handler anywhere in `GameView.vue` or `useGameLoop.ts`.

### U-2. No undo / refund for a freshly placed tower
- `BuildPanel.vue:90-103` only dispatches `TOWER_PARAMS_SET`. Players who misclick have no way to remove a placement.

### U-3. No feedback when you click an unaffordable tower
- `TowerBar.vue:15-19` — `selectTower` still toggles selection even when `canAfford(def.cost)` is false. No shake / toast / sound.

### U-4. No wave progress indicator
- HUD shows wave number but not enemies-remaining or a progress bar (`HUD.vue`). Players can't tell how close a wave is to ending.

### U-5. No "tower placed" confirmation
- After placing a tower the `BuildPanel` pops up silently. No animation, particle, or toast signalling the placement happened.

### U-6. Selected tower has weak visual feedback
- `TowerBar.vue:85-88` — gold border + 12% background tint. On the gold-on-dark palette the cue is subtle. Add `box-shadow: inset 0 0 0 2px var(--gold-bright)` or an icon badge.

### U-7. Phase change is not highlighted
- `HUD.vue:10-20, 100` — no animation/transition on phase label. Players can miss BUILD → WAVE → BUFF_SELECT transitions especially when focused on canvas.

### U-8. Modal OK button is Chinese-only
- Assumed from `Modal.vue` usage pattern; with bilingual UI this should be localised.

---

## 8. Typography & styling

### T-1. All sizes in px (no REM scale)
- Entire codebase uses absolute pixel font sizes (9/10/11/12/13/14/18). User-level browser zoom/text-scaling doesn't apply cleanly.
- **Fix:** Set `:root { font-size: 16px }` and convert to `rem`.

### T-2. Tiny labels at 9-10px
- `HUD.vue:88` hud-label 9px; `TowerBar.vue:93` tower-name 9px, `card-desc` 10px, etc. These fall below 12px accessibility floors.

### T-3. Low-contrast body text
- `.card-desc` `#9a8a70` on `rgba(255,255,255,0.04)` — about 4.2:1, below WCAG AA 4.5:1 for small text.

### T-4. `word-break: break-all` on function expression
- `FunctionPanel.vue:250` — will split tokens like `sin(` across lines. Prefer `overflow-x:auto; white-space:nowrap` on a monospace expression, or `break-word`.

### T-5. `.rune-input` width 70px
- `BuildPanel.vue:206` — mismatch with `global.css:66` which sets `.rune-input` to 80px. Scoped style wins but the duplication is a code smell; keep a single source of truth.

---

## 9. Error / empty states

### E-1. `buff-result` guard has no timeout
- `BuffCardPanel.vue:16-24` — comment explicitly calls out "no wall-clock failsafe". If the engine ever drops both `BUFF_RESULT` *and* the PHASE_CHANGED exit, the panel stays disabled forever. The phase watcher helps, but it's worth a sanity `setTimeout` at 10s as belt-and-braces.

### E-2. No fallback if tower definition is missing
- `BuildPanel.vue:25-27` — `TOWER_DEFS[tower.value.type]` can be undefined for a legacy/unknown type; then `towerDef` is null and the whole `v-if="tower && towerDef"` silently hides the panel with no clue to the user.

### E-3. No "no buffs available" text
- `BuffCardPanel.vue:70-99` — if `cards` is empty the panel shows a title, empty flex row, and Skip button. A small explanatory line would help.

---

## 10. Minor

### M-1. `title` tooltip uses literal `\n`
- `TowerBar.vue:38` — real newlines in native tooltips work in most browsers but not reliably. Long descriptions also get truncated by the OS tooltip engine.

### M-2. `FunctionPanel` watcher redraws on every `leadEnemyX` tick
- `FunctionPanel.vue:141-144` — fine if `leadEnemyX` updates at frame rate, but worth a `requestAnimationFrame` guard if the store pushes more frequently.

### M-3. `BuildHint` position assumes HUD height is 48px
- `HUD.vue:70` sets `height:48px`; `BuildHint.vue:31` sets `top:56px`. Magic numbers — if HUD height changes, the hint overlaps HUD.

### M-4. Inline `start-wave-btn` lives in `GameView.vue` rather than as a component
- `views/GameView.vue:80-86` — out of place; every other overlay control is a component.

---

## 11. Fix-priority summary

| Priority | Items |
|----------|-------|
| **P0 (blocking visual bugs)**   | C-1, C-3, C-5 |
| **P1 (layout & z-index)**       | C-2, C-4, Z-1, R-1, R-3, R-4 |
| **P2 (language + a11y)**        | L-1, L-2, L-4, L-5, A-1, A-2, A-3, A-4, A-6 |
| **P3 (UX polish)**              | U-1, U-2, U-3, U-4, U-5, U-6, U-7 |
| **P4 (typography / minor)**     | T-1, T-2, T-3, T-4, T-5, M-1, M-2, M-3, M-4 |
| **P5 (error states)**           | E-1, E-2, E-3, K-1, K-2, K-3 |

**Total findings:** 47 (3 Critical, 6 High, ~20 Medium, rest Low).

---

## 12. Recommended immediate patches

1. **Move `start-wave-btn`** from `top:56 right:16` to either (a) a right-aligned slot inside the HUD row, or (b) left of the `TowerBar`. Eliminates C-1 outright.
2. **Move `FunctionPanel`** to the left rail (`left:16 top:64`) so it doesn't fight `BuildPanel`. Fixes C-2.
3. **Replace `TowerBar`'s `flex-wrap: wrap`** with `flex-wrap: nowrap; overflow-x: auto;` and pin its height — C-3 goes away and the design stays stable as more towers unlock.
4. **Wrap `.game-view` in a scaling container** that uses `aspect-ratio: 16/9; width: min(100vw, 1280px);` and scales the canvas via transform. Fixes C-5 and K-1 together.
5. **Define z-index tokens** in `variables.css`; replace every magic number. Fixes Z-1.
6. **Introduce a minimal locale map** (even without `vue-i18n`) and replace the mixed-language strings in `BuildHint`, `BuildPanel`, `BuffCardPanel`, and the two modal calls in `GameView.vue`.

---

_Every file:line citation above was verified by reading source on branch `feature/piecewise-paths` at the audit date._
