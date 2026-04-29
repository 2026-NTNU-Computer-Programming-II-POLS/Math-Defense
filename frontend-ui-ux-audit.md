# Frontend UI/UX Audit Report

**Project:** Math Defense (Vue 3 + TypeScript)
**Date:** 2026-04-29
**Scope:** 44 Vue components, 5 Pinia stores, 10 services, router, global styles

---

## Table of Contents

1. [Critical: Page Scrolling Completely Broken](#1-critical-page-scrolling-completely-broken)
2. [Layout & Overflow Issues](#2-layout--overflow-issues)
3. [Z-Index & Positioning Issues](#3-z-index--positioning-issues)
4. [Responsive Design Issues](#4-responsive-design-issues)
5. [Routing, Navigation & State Issues](#5-routing-navigation--state-issues)
6. [Component-Level UX Issues](#6-component-level-ux-issues)
7. [Visual Consistency Issues](#7-visual-consistency-issues)
8. [Accessibility Issues](#8-accessibility-issues)
9. [Summary & Priority Matrix](#9-summary--priority-matrix)

---

## 1. Critical: Page Scrolling Completely Broken

Three related issues combine to make **every non-game page unscrollable** when content exceeds viewport height.

### 1.1 `body { overflow: hidden }` prevents all scrolling

**File:** `src/styles/global.css:28`

```css
body { overflow: hidden; }
```

This is appropriate for the GameView (fixed 1280x720 canvas) but applies globally. All non-game views (Leaderboard, Achievement, TalentTree, Rankings, Admin, Class, TeacherDashboard, Profile, etc.) grow content downward and rely on scrolling.

### 1.2 `html, body, #app { height: 100% }` constrains all views

**File:** `src/styles/global.css:18-21`

```css
html, body, #app { width: 100%; height: 100%; }
```

Creates a fixed-height chain from root to `#app`. Views using `min-height: 100vh` cannot expand beyond the capped parent.

### 1.3 No `overflow-y: auto` on view root containers

**Files:** `LeaderboardView.vue:102`, `AchievementView.vue:83`, `TalentTreeView.vue:124`, `RankingsView.vue:289`

These views set `min-height: 100vh` but have no overflow set on their root element.

**Impact:** Any page with more content than fits the viewport is unusable -- users cannot scroll to see the rest. This affects Leaderboard (20+ entries), Achievement (many cards), TalentTree (7 tower sections), Admin (user lists), and more.

**Fix:** Remove `overflow: hidden` from body globally and apply it only within `GameView.vue` (which already has `overflow: hidden` on `.game-shell`), or set `#app { overflow-y: auto }` for non-game routes.

---

## 2. Layout & Overflow Issues

### 2.1 MenuView uses `height: 100vh` causing button clipping

**File:** `src/views/MenuView.vue:59`

The menu renders up to 9 navigation buttons with `height: 100vh` (not `min-height`) and `justify-content: center`. On short viewports (phones in landscape, small laptops), buttons at the top and bottom are clipped and unreachable.

### 2.2 ShopPanel overlaps HUD row-2

**File:** `src/components/game/ShopPanel.vue:52`

ShopPanel starts at `top: 56px`, but HUD row-2 spans from 49px to ~93px. Approximately 37 pixels of overlap.

### 2.3 FunctionPanel and ShopPanel overlap during build phase

**Files:** `src/components/game/FunctionPanel.vue:216`, `src/components/game/ShopPanel.vue:51`

Both panels are positioned in the top-right corner during the build phase. FunctionPanel at `right: 16px; top: 64px; width: 232px` and ShopPanel at `right: 8px; top: 56px; width: 200px`. They physically overlap nearly entirely.

### 2.4 HUD row-2 overlaps wrapped row-1 on narrow viewports

**File:** `src/components/game/HUD.vue:219, 345-355`

`hud-row2` is hardcoded at `top: 49px`. The `@media (max-width: 640px)` rule makes the HUD wrap, growing row-1 beyond 48px, but row-2 stays at 49px causing overlap.

### 2.5 BuffCardPanel has no responsive fallback

**File:** `src/components/game/BuffCardPanel.vue:206`

Fixed `width: 680px` with no `max-width` and no responsive breakpoint. The `.card-list` inside uses `display: flex` with no `flex-wrap`, so three cards will clip on narrow screens.

---

## 3. Z-Index & Positioning Issues

### 3.1 `position: fixed` inside CSS `transform: scale()` container

**Files:**
- `src/views/ScoreResultView.vue:92` -- `.score-overlay { position: fixed; z-index: 1000; }`
- `src/components/game/MontyHallPanel.vue:108` -- `.monty-hall-overlay { position: fixed; z-index: 1000; }`

CSS `position: fixed` inside a `transform`'d parent is resolved relative to the transformed coordinate space, not the viewport. These overlays will be incorrectly sized and positioned within the scaled 1280x720 game view. Compare with `BuffCardPanel.vue:196` which correctly uses `position: absolute`.

### 3.2 ChainRulePanel teleports to body, bypassing game scaling

**File:** `src/components/game/ChainRulePanel.vue:45`

```vue
<Teleport to="body">
```

This places the overlay at full viewport size while the game underneath is scaled down, creating a visual mismatch on small screens.

### 3.3 Hardcoded z-index values bypass the z-index ladder

The project defines a z-index ladder in `variables.css` (max `--z-modal: 50`), but several components use raw values:

| File | Line | Value | Should Use |
|------|------|-------|------------|
| `ScoreResultView.vue` | 98 | `z-index: 1000` | `var(--z-modal)` |
| `MontyHallPanel.vue` | 109 | `z-index: 1000` | `var(--z-modal)` |
| `ChainRulePanel.vue` | 79 | `z-index: 1000` | `var(--z-modal)` |
| `AchievementToast.vue` | 49 | `z-index: 9999` | Defined toast slot |

---

## 4. Responsive Design Issues

### 4.1 Fixed pixel widths without `max-width` (12 components)

All of these panels use a fixed `width` with no `max-width` constraint, causing horizontal overflow on phones (typically 360-414px wide):

| File | Line | Width |
|------|------|-------|
| `AuthView.vue` | 176 | 360px |
| `ClassView.vue` | 189 | 420px |
| `ProfileView.vue` | 133 | 420px |
| `AdminView.vue` | 143 | 480px |
| `TeacherDashboard.vue` | 90 | 480px |
| `TerritoryListView.vue` | 70 | 500px |
| `TeacherTerritorySetup.vue` | 109 | 440px |
| `TerritoryDetailView.vue` | 89 | 600px |
| `TerritoryResultView.vue` | 80 | 360px |
| `Modal.vue` | 97 | 360px |
| `LevelCard.vue` | 52 | 680px |
| `BuffCardPanel.vue` | 206 | 680px |

**Fix:** Add `max-width: calc(100% - 32px)` alongside each fixed `width`.

### 4.2 Touch targets too small for mobile (< 44px)

| File | Line | Size | Element |
|------|------|------|---------|
| `ClassView.vue` | 250-256 | ~14-18px tall | `.btn-sm` (Regenerate code, Remove student) |
| `TeacherTerritorySetup.vue` | 142-147 | ~14-18px tall | `.btn-sm` |
| `TerritorySlotCard.vue` | 64 | ~22px tall | `.slot-play-btn` (Seize/Challenge) |
| `SpellBar.vue` | 77-78 | 40x40px | `.spell-btn` (critical game buttons) |
| `AdminView.vue` | 158-164 | ~23px tall | `.tab-btn` |

### 4.3 Tables without narrow viewport handling

**Files:** `LeaderboardView.vue:134-148`, `RankingsView.vue:309-311`

Tables with 6+ columns have no responsive strategy -- no `overflow-x: auto` wrapper, no column hiding at breakpoints. On phones, text becomes unreadably small.

### 4.4 Title text overflow risk

**File:** `src/views/MenuView.vue:69-80`

Title "數學防線" at `font-size: 48px; letter-spacing: 8px` and subtitle at `font-size: 20px; letter-spacing: 12px` have no overflow protection. The 12px letter-spacing alone adds ~120px to intrinsic width.

### 4.5 HUD media query mismatch with CSS transform scaling

**File:** `src/components/game/HUD.vue:345`

The `@media (max-width: 640px)` breakpoint triggers based on viewport width, but the game canvas is inside a 1280px container scaled down via CSS `transform`. The media query fires at the wrong threshold relative to the actual rendered content size.

---

## 5. Routing, Navigation & State Issues

### 5.1 SECURITY: Teacher routes bypass auth guard

**File:** `src/router/index.ts:5-8, 127-139`

`TEACHER_ROUTES` (`territory-create`, `teacher-dashboard`) are never included in the `isProtected` check. The guard returns `true` before reaching the `TEACHER_ROUTES.has()` check (dead code). **Any unauthenticated user can access `/territory/create` and `/teacher`.**

### 5.2 `credentials: 'same-origin'` breaks cross-origin deployment

**File:** `src/services/api.ts:134`

The fetch `credentials` mode is hardcoded to `'same-origin'`, but the app supports `VITE_API_BASE_URL` for cross-origin deployments. Auth cookies will not be sent to a different origin. Note: `authService.logout()` at `authService.ts:49` correctly uses `'include'`, creating an inconsistency.

### 5.3 Missing 404 catch-all route

**File:** `src/router/index.ts:12-113`

No `/:pathMatch(.*)*` route. Typos or stale bookmarks render a blank page with no feedback.

### 5.4 Stores not cleared on logout

**File:** `src/stores/authStore.ts:95-117`

`logout()` does not reset `gameStore`, `talentStore`, or `territoryStore`. If user A logs out and user B logs in on the same browser, user B could see stale talent modifiers, territory data, and game state from user A.

### 5.5 No route-leave guard on game route

**File:** `src/router/index.ts`

No `beforeRouteLeave` guard on the `game` route. Users can navigate away mid-game without warning, losing progress and potentially leaving orphan sessions.

### 5.6 Duplicated protected-routes sets

**Files:** `src/stores/authStore.ts:108`, `src/router/index.ts:5-8`

The auth store duplicates the full list of protected route names. Adding a new protected route to the router without updating the store copy causes logout from that route to leave the user stranded.

### 5.7 No route transitions or loading indicators

**File:** `src/App.vue`

The root component is a bare `<RouterView>` with no `<Transition>` wrapper and no navigation progress indicator. All views use lazy loading (`() => import(...)`), so on slow connections users see blank screens during chunk downloads.

### 5.8 `history.state` fragility with browser Back/Forward

**File:** `src/views/GameView.vue:30-37`

Level data passed via `history.state`. Browser Back then Forward can produce inconsistent state before the redirect to level-select fires.

### 5.9 Menu navigates via path strings instead of named routes

**File:** `src/views/MenuView.vue:18-44`

All buttons use `router.push('/path')` instead of named routes. The `/game` button pushes directly to `/game` without level-select, causing an unnecessary redirect hop.

### 5.10 TerritoryStore shares loading/error across unrelated operations

**File:** `src/stores/territoryStore.ts`

A single `loading` and `error` ref are shared across 6 different async operations. Concurrent operations interfere with each other's loading/error states.

### 5.11 `authService.logout()` bypasses the api wrapper

**File:** `src/services/authService.ts:39-51`

Uses raw `fetch()` instead of the `api` wrapper, with `.catch(() => {})` silently swallowing all errors. No timeout, no CSRF header, no error propagation.

---

## 6. Component-Level UX Issues

### 6.1 Missing confirmation dialogs for destructive actions

| File | Line | Action |
|------|------|--------|
| `ClassView.vue` | 80 | `removeStudent()` -- immediately removes, no confirmation |
| `TalentTreeView.vue` | 55 | `resetTree()` -- wipes entire talent tree, no confirmation |
| `TerritoryDetailView.vue` | 25 | `handleSettle()` -- permanently settles activity, no confirmation |
| `TowerInfoPanel.vue` | 49 | `refundTower()` -- removes tower, no confirmation |

### 6.2 Buttons missing loading/disabled states

| File | Line | Button |
|------|------|--------|
| `ClassView.vue` | 35 | Create class |
| `ClassView.vue` | 47 | Join class |
| `ClassView.vue` | 68 | Add student |
| `ClassView.vue` | 90 | Regenerate code |
| `TerritoryDetailView.vue` | 25 | Settle activity |
| `AdminView.vue` | 79 | Tab switch (concurrent requests possible) |

Users can double-click these buttons, potentially creating duplicate resources.

### 6.3 Forms with silent validation failure

| File | Lines | Behavior |
|------|-------|----------|
| `TeacherTerritorySetup.vue` | 26-27 | Silently returns if title empty or deadline missing |
| `TerritoryResultView.vue` | 25 | Silently returns if score <= 0 |
| `ClassView.vue` | 36, 48, 69 | All three forms silently reject empty input |

No validation messages are ever shown to the user.

### 6.4 Missing/silent error handling for API calls

| File | Line | Problem |
|------|------|---------|
| `TeacherTerritorySetup.vue` | 26-28 | `submit()` silently fails on API error |
| `ClassView.vue` | 59-63 | `selectClass()` swallows errors, shows misleading empty list |
| `ProfileView.vue` | 40-44 | Empty `catch` block; sections silently don't appear |
| `ClassView.vue` | 101 | `copyCode()` gives no feedback on success or failure |

### 6.5 Stale error messages

| File | Line | Problem |
|------|------|---------|
| `TalentTreeView.vue` | 49 | Error persists indefinitely across interactions |
| `TeacherTerritorySetup.vue` | 26 | `store.error` not cleared before new submission |

### 6.6 Missing loading indicators

| File | Lines | Problem |
|------|-------|---------|
| `ProfileView.vue` | 62-101 | No spinner while achievement/talent data loads |
| `TalentTreeView.vue` | 42 | No per-node loading indicator during allocation |

### 6.7 Lists without pagination or virtualization

**File:** `AchievementView.vue:25`

The entire achievement list is loaded and rendered at once with no pagination or virtualization.

---

## 7. Visual Consistency Issues

### 7.1 Hardcoded hex colors instead of theme variables

These files duplicate the theme palette with raw hex values instead of using the CSS variables defined in `variables.css`:

| File | Lines | Colors Used |
|------|-------|-------------|
| `LevelSelectView.vue` | 73-164 | `#e0d0b0`, `#ffd700`, `#252030`, `#3a3028`, `#8b7342`, `#2a2535`, `#4a82c8`, `#cc4444` |
| `InitialAnswerView.vue` | 128-273 | `#e0d0b0`, `#ffd700`, `#1a1520`, `#252030`, `#3a3028`, `#8b7342`, `#4a82c8`, `#cc4444`, `#4aab6e`, `#c89848`, `#2a2540`, `#1a3020`, `#301a1a` |
| `ChainRulePanel.vue` | 82-119 | `#1a1520`, `#8b7342`, `#ffd700`, `#252030`, `#e8dcc8`, `#3a3028` |
| `ProfileView.vue` | 192 | `#e74c3c` (unique red not in theme palette) |

### 7.2 Inconsistent font sizing units

The project uses a mix of `px` and `rem` units:
- `LevelSelectView.vue` and `InitialAnswerView.vue` use `rem` units
- All other files use `px` units
- `global.css:10-13` acknowledges this: "Components still author in px today (a fuller rem migration is tracked separately)."

---

## 8. Accessibility Issues

### 8.1 Modals missing dialog semantics and keyboard handling

| File | Missing |
|------|---------|
| `MontyHallPanel.vue:51-98` | No `role="dialog"`, `aria-modal`, focus trap, Escape handler |
| `ChainRulePanel.vue:46-67` | No `role="dialog"`, `aria-modal`, focus trap, Escape handler |
| `ScoreResultView.vue:29-86` | No `role="dialog"`, `aria-modal`, focus trap, Escape handler, no auto-focus on Continue button |
| `LevelCard.vue:20-37` | No `role="dialog"`, `aria-modal`, focus trap, Escape handler, **no close button at all** |

### 8.2 Missing `aria-label` attributes

| File | Line | Element |
|------|------|---------|
| `AdminView.vue` | 84 | Search input (has placeholder but no label) |
| `MatrixInputPanel.vue` | 53-60 | Matrix cell inputs (no programmatic label association) |
| `SpellBar.vue` | 47-64 | Spell buttons (rely solely on `title` attribute) |
| `TowerInfoPanel.vue` | 97 | Refund button (no context about which tower) |
| `TerritorySlotCard.vue` | 34 | Play button (dynamic text but no contextual aria-label) |

### 8.3 Missing `prefers-reduced-motion` for animations

HUD.vue and TowerBar.vue correctly respect `prefers-reduced-motion`, but these do not:

| File | Line | Animation |
|------|------|-----------|
| `AchievementToast.vue` | 70 | `slideIn` keyframe animation |
| `TowerInfoPanel.vue` | 129 | `panel-pop` keyframe animation |
| `MontyHallPanel.vue` | 162 | Hover scale transition on doors |
| `SpellBar.vue` | 88 | Hover scale transition |

---

## 9. Summary & Priority Matrix

### Critical (Blocks Core Usage)

| # | Issue | Files |
|---|-------|-------|
| 1.1-1.3 | Non-game pages cannot scroll | `global.css`, multiple views |
| 5.1 | Teacher routes bypass auth guard (security) | `router/index.ts` |
| 5.2 | Cross-origin auth cookies not sent | `api.ts` |

### High (Significant UX Degradation)

| # | Issue | Files |
|---|-------|-------|
| 4.1 | 12 panels overflow on phones (no max-width) | 12 components |
| 2.1 | Menu buttons clipped on short viewports | `MenuView.vue` |
| 5.4 | Stores not cleared on logout (data leak) | `authStore.ts` |
| 3.1-3.2 | Overlays mispositioned in scaled game | `ScoreResultView`, `MontyHallPanel`, `ChainRulePanel` |
| 6.1 | No confirmation for destructive actions (4 places) | Multiple |
| 6.2 | Double-click creates duplicates (6 buttons) | Multiple |

### Medium (Noticeable Issues)

| # | Issue | Files |
|---|-------|-------|
| 2.2-2.3 | Panel overlaps in game UI | `ShopPanel`, `FunctionPanel`, `HUD` |
| 3.3 | Z-index ladder bypassed | 4 components |
| 4.2 | Touch targets too small | 5 components |
| 4.3 | Tables break on narrow screens | `LeaderboardView`, `RankingsView` |
| 5.3 | No 404 page | `router/index.ts` |
| 5.5 | No leave-guard on game route | `router/index.ts` |
| 5.10 | Shared loading/error in territory store | `territoryStore.ts` |
| 6.3 | Silent form validation (5 forms) | Multiple |
| 6.4 | Silent API error handling (4 places) | Multiple |
| 8.1 | Modals missing dialog semantics (4 modals) | Multiple |

### Low (Polish / Maintenance)

| # | Issue | Files |
|---|-------|-------|
| 5.6 | Duplicated protected-routes sets | `authStore.ts`, `router/index.ts` |
| 5.7 | No route transitions | `App.vue` |
| 5.8-5.9 | history.state fragility, path strings | `GameView`, `MenuView` |
| 7.1 | Hardcoded colors (4 files) | Multiple |
| 7.2 | Mixed px/rem units | Project-wide |
| 8.2 | Missing aria-labels (5 places) | Multiple |
| 8.3 | Missing prefers-reduced-motion (4 places) | Multiple |
| 6.5 | Stale error messages | `TalentTreeView`, `TeacherTerritorySetup` |

---

### Quick Win Recommendations

1. **Fix scrolling (Critical):** Move `overflow: hidden` from `body` to `.game-shell` in GameView. Change `#app` to `min-height: 100%` instead of `height: 100%`.
2. **Fix teacher auth guard:** Add `TEACHER_ROUTES` to the `isProtected` check in the router guard.
3. **Add `max-width: calc(100% - 2rem)`** to all fixed-width panels (bulk find-and-replace).
4. **Fix `position: fixed` overlays:** Change to `position: absolute` inside the game container, or teleport them correctly.
5. **Add confirmation dialogs** for the 4 destructive actions using the existing `Modal.vue` component.
