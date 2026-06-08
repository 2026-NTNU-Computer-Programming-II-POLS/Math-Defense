# Visual Redesign Plan

**Scope.** This plan executes two complementary tracks:

- **Track A — Game Feel & HUD polish.** Additive layer of juice: projectile
  trails and glow, hit-flash and impact particles, enemy death animations,
  tower placement/upgrade feedback, HUD value-change reactions, screen shake.
- **Track B — Math-theme integration.** Replace the procedural tower and
  enemy art with a unified visual vocabulary in which **towers are
  mathematical instruments** and **enemies are personified errors / chaos
  constructs**. Establishes a coherent identity that the current "geometric
  tower vs. cartoon slime" split lacks.

Track A is risk-light and ships early wins. Track B is a deeper rewrite that
sits on top of Track A's foundations (particle system, effect lifecycle,
death state). The two tracks are sequenced — A first, then B — so each
intermediate phase is demoable and reversible.

**Out of scope.**

- Typography migration. The in-flight
  [UI_Typography_Refresh_Plan.md](./UI_Typography_Refresh_Plan.md) owns that.
  All new authored styles in this plan **must** use the `--text-*` tokens
  defined in `frontend/src/styles/variables.css:46–73` and route numeric
  readouts through `var(--font-mono)`. Raw `font-size: NNpx` is blocked by
  `npm run no-raw-px` (frontend `CLAUDE.md:52–88`).
- Spec rewrite. `Math_Defense_Spec.md §4` will receive a delta after Phase 7,
  not a wholesale rewrite.

**Estimated effort.** ~26 working days across 9 phases (Phase 0–7 plus
Phase 6.5 for pet alignment). The original estimate was 21 days; the
extra ~5 days cover the foundation work added in Phase 0 (registry
governance, seeded-RNG extraction, LEVEL_START contract), the UI-shadow
updates in Phases 5–6 (TowerBar, WaveForecast, ManualModal), and the
pet alignment decision in Phase 6.5.

---

## Guiding Principles

1. **Event-driven only.** No system reaches across boundaries. New visual
   reactions subscribe to existing events on `game.eventBus`
   (`TOWER_PLACED`, `TOWER_UPGRADED`, `ENEMY_KILLED`, `DAMAGE_RESOLVED`,
   `ENEMY_REACHED_ORIGIN`, …). New events are introduced sparingly and only
   where an existing one will not suffice.

   **Hard governance gate.** Every new `eventBus.on(Events.X, ...)`
   subscription **must** be mirrored by an entry in
   `frontend/src/engine/event-handlers/registry.ts`. CI script
   `npm run event-registry-check` walks production source and fails on any
   drift. This applies to every renderer / composable / system this plan
   introduces — no exception. Same rule for new events: add the key to
   `Events` in `data/constants.ts` and append the registry entry
   (`[]` if broadcast-only) in the same PR.
2. **Procedural canvas.** No sprite sheets, no SVG blits, no external image
   assets. All new art is drawn through the existing `ctx.*` API to keep the
   pipeline simple and the bundle small. The existing `renderers/primitives.ts`
   library is extended (`drawOrbitRing`, `drawDiamondCrystal`) before any new
   one-off geometry is hand-written.
3. **Lifecycle uniformity.** Every transient effect uses the
   `{ age, maxAge, … }` pattern already established by
   `SpellEffectRenderer.ts` and `CombatFeedbackRenderer.ts`. A shared base
   abstraction is introduced in Phase 0 to formalise this and stop the DRY
   drift.
4. **Determinism preserved.** Phase 0 introduces `ANIM` constants in
   `data/constants.ts`. **`seededUnit` / `seedFor` are currently private to
   `SpellEffectRenderer.ts:35–40` — they are NOT yet a shared utility.**
   Phase 0 first extracts them to a new `frontend/src/math/seededRandom.ts`
   module (and refactors `SpellEffectRenderer` to import from it); only
   then may downstream phases use them. Visual layer must never branch on
   `Math.random()` in a way that could influence game state — enforced by
   `npm run lint-determinism` (CI).
5. **Layered, not coupled.** No renderer mutates entity state. Visual hooks
   read projections (`engine/projections/views.ts`) or listen to events; they
   never write back, keeping the engine → render boundary clean.
6. **Reduced-motion respect.** A single `prefers-reduced-motion` gate
   (read once into a `motionPreference` ref) attenuates intensity (particle
   count, shake amplitude, flash brightness) instead of removing effects
   entirely. Implemented in Phase 7.
7. **Per-phase demoable.** Every phase ends in a state that can be merged,
   played, and reverted independently. No phase leaves the codebase
   half-redesigned.
8. **English-only source.** All new code, comments, and docs created by
   this plan must be in English (enforced by
   `npm run lint-chinese-comments`). Pre-existing Chinese comments in
   files this plan touches must be converted in the same PR.
9. **Pause-safe lifecycle.** Effect ages must advance via the `dt`
   parameter that the engine passes to `update(dt, game)`. When the
   engine is paused, `dt` is zero (or the system is skipped), so effects
   freeze with the rest of the simulation. Renderers must not poll
   `performance.now()` for animation timing.

---

## Architecture & Foundations

### Renderer registration

Systems and renderers register via
`engine/register-systems.ts:57–97`. The fixed-timestep loop in
`engine/Game.ts:518–592` calls `update(dt, game)` on every system in order,
then `render(renderer, game)` on every renderer. New visual layers slot in
the same way; placement in the registration order determines z-order.

### Shared effect base

A new module `frontend/src/renderers/effects/EffectLayer.ts` will be
introduced in Phase 0:

```ts
// Pseudocode
export interface Effect { age: number; maxAge: number; dead?: boolean }
export abstract class EffectLayer<E extends Effect> implements GameSystem {
  protected readonly effects: E[] = []
  init(game: Game): void {
    // Subclasses override to register event listeners.
    // Always also subscribe to LEVEL_START to call clear() — see below.
    game.eventBus.on(Events.LEVEL_START, () => this.clear())
  }
  update(dt: number, _game: Game): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.age += dt
      if (e.age >= e.maxAge || e.dead) this.effects.splice(i, 1)
    }
  }
  abstract render(renderer: Renderer, game: Game): void
  protected spawn(e: E): void { this.effects.push(e) }
  protected clear(): void { this.effects.length = 0 }
}
```

**LEVEL_START contract.** Every effect layer **must** drop active effects
on `Events.LEVEL_START` — `SpellEffectRenderer` already does this
(`engine/event-handlers/registry.ts:52`); replay restart otherwise leaves
stale particles on screen. The base class' `init()` performs this
subscription, so subclasses only need to call `super.init(game)`. Each
subscription requires an entry in `EVENT_HANDLER_REGISTRY`.

`SpellEffectRenderer` and `CombatFeedbackRenderer` are *not* refactored to
extend this in Phase 0 — only new layers use it. A separate cleanup PR can
ratchet the existing two later.

### Animation timing constants

A new export in `frontend/src/data/constants.ts`:

```ts
export const ANIM = {
  ENEMY_DEATH:        0.35,
  BOSS_DEATH:         1.20,
  PLACEMENT_POP:      0.45,
  UPGRADE_BURST:      0.55,
  HIT_FLASH:          0.10,
  TOWER_FIRE_FLASH:   0.14,
  HUD_VALUE_POP:      0.28,
  SHAKE_HIT:          0.18,
  SHAKE_BREACH:       0.55,
  PROJECTILE_TRAIL:   0.25,   // age window kept in history buffer
} as const
```

Every duration referenced from a renderer **must** come from this table.
This is also where Phase 7 tuning will land — one file, one diff.

### Screen-shake transform

Inserted in `engine/Game.ts` `_render()` (defined at line 555) after
`renderer.clear()`. A `ShakeController` (new module under `engine/`) tracks
active shake events, computes a per-frame `{ dx, dy }`, and
`ctx.translate()` is applied before any system renders. Shake decays per
`ANIM.SHAKE_HIT` / `ANIM.SHAKE_BREACH`. Reduced-motion zeroes amplitude.
Shake age advances via `dt` from `Game._update`, not wall-clock, so pause
freezes it.

### Enemy death state

Three new optional fields on the Enemy entity
(`frontend/src/entities/types.ts:100–157`):

```ts
dying?: boolean
dyingTimer?: number
deathMaxTime?: number
```

**Combat deaths vs. silent removals.** `enemy.alive = false` is set in
**five** sites today; only the two combat-kill sites must transition to
the new dying state, the other three remain unchanged:

| Site | Reason | Action in Phase 0 |
|------|--------|-------------------|
| `domain/combat/SplitPolicy.ts:77` (`killEnemy()`) | Combat kill, splits, bosses. | **Set dying state**, emit `Events.ENEMY_DYING`. |
| `systems/LimitTowerSystem.ts:64` (`killEnemy()` direct call) | Limit-tower instant kill. | Same — already routes through `killEnemy()`. **Verify no shortcut path bypasses it.** |
| `systems/MovementSystem.ts:148` | Enemy reached origin. | Leave as-is — enemy already damaged the player, must vanish. |
| `systems/MovementSystem.ts:155` | Out-of-path defensive warning. | Leave as-is — error path; instant cleanup. |
| `systems/MovementSystem.ts:195` (`_applyPostAdvance`) | Reached goal. | Leave as-is — same as 148. |

`alive` flips to `false` in `killEnemy()` exactly as today so combat
treats the enemy as dead immediately — only the *render* lifecycle is
extended via the new `dying` flag.

`MovementSystem.update()`
(`frontend/src/systems/MovementSystem.ts:44–74`) is amended:

- Dying enemies (`alive=false && dying=true && dyingTimer<deathMaxTime`)
  are skipped by the movement step and accumulate `dyingTimer += dt`.
- Removal predicate becomes
  `!alive && (!dying || dyingTimer >= deathMaxTime)`.

`engine/projections/project-enemies.ts` is amended to include dying
enemies in the view with an added `dyingProgress: number ∈ [0,1]` field
so the renderer can paint the corpse without reading entity state
directly (the engine → render boundary is preserved).

A new event `Events.ENEMY_DYING` fires from `killEnemy()` for the
death-particle renderer to consume. Registry entry added in the same PR.

### New events introduced by this plan

Each one requires (a) a `Events.*` key in `data/constants.ts`,
(b) emission at the documented site, (c) a matching block in
`EVENT_HANDLER_REGISTRY` (`[]` if no listeners yet at introduction).

| Event | Emitted from | Introduced in |
|-------|--------------|---------------|
| `TOWER_FIRED` | `systems/CombatSystem.ts` at the moment a tower spawns a projectile (no event exists today — `CombatSystem` is currently silent on the bus). | Phase 0 |
| `ENEMY_DYING` | `domain/combat/SplitPolicy.ts` `killEnemy()`. | Phase 0 (wired) / Phase 2 (consumed) |
| `BOSS_DIED` | Same site, gated on `enemy.type === BOSS_A || BOSS_B`. Optional — Phase 2 may instead branch inside the listener on `ENEMY_DYING`. Pick one approach and document. | Phase 2 |

### Renderer registration order (z-order)

`engine/register-systems.ts:65–95` lists systems in order. New renderers
slot in at these exact positions (deepest first, so later renderers paint
on top):

```
enemyRenderer
  ↳ deathParticleRenderer        ← NEW (Phase 2) — particles over corpses
towerRenderer
  ↳ towerLifecycleRenderer       ← NEW (Phase 3) — place/upgrade burst over towers
projectileRenderer
  ↳ impactEffectRenderer         ← NEW (Phase 1) — sparks over projectile tails
magicZoneRenderer
radarRangeRenderer
matrixLaserRenderer
petRenderer
spellEffectRenderer
combatFeedbackRenderer            ← floating damage text stays on top
  ↳ hudValuePopRenderer (in-canvas variant, if used; Phase 4)
```

`WaveBanner` / `PhaseFader` are Vue components, not registered systems —
they live outside the canvas.

---

## Phase Breakdown

### Phase 0 — Foundations (≈1 day) ⛏️ no visible change

**Goal.** Land everything the later phases depend on, behind feature flags
where useful, with zero behavioural change in the game.

**Tasks.**

1. Add `ANIM` constants to `frontend/src/data/constants.ts`.
2. **Extract shared seeded RNG.** Create
   `frontend/src/math/seededRandom.ts` exporting `seededUnit` and
   `seedFor` (lift verbatim from
   `renderers/SpellEffectRenderer.ts:35–43`). Refactor
   `SpellEffectRenderer` to import from the new module. Confirms a
   single deterministic RNG surface for all visual layers downstream.
3. Create `frontend/src/renderers/effects/EffectLayer.ts` (shared base
   with `LEVEL_START`-triggered `clear()` per "Shared effect base"
   above).
4. Create `frontend/src/engine/ShakeController.ts` and wire into
   `Game._render()` at line 555 (zero amplitude by default — no shake
   yet). Age advances via `dt` from `Game._update`, not wall-clock.
5. Add `dying`, `dyingTimer`, `deathMaxTime`, `hitFlashAge` to Enemy
   interface (`entities/types.ts`). Latter is set in Phase 1 but field
   landed now to keep Phase 1's diff combat-only.
6. Add `dyingProgress` and `hitFlashAge` to `EnemyView`
   (`engine/projections/views.ts` + `project-enemies.ts`). Include
   dying enemies in the view (today they're filtered out).
7. Amend `MovementSystem`: skip movement step for dying enemies; new
   removal predicate
   `!alive && (!dying || dyingTimer >= deathMaxTime)`. Increment
   `dyingTimer` each frame for dying enemies.
8. Amend `SplitPolicy.killEnemy()` to set dying state **and** emit
   `Events.ENEMY_DYING`. (Original plan deferred the emit to Phase 2 —
   reverted; combining them keeps the registry update atomic.) Leave
   the three MovementSystem `enemy.alive = false` sites at lines 148,
   155, 195 unchanged — those are non-combat removals that must vanish
   instantly.
9. **Add `Events.TOWER_FIRED`.** `CombatSystem` is currently silent on
   the bus (`grep eventBus.emit` returns no matches). Tasks:
   - Add `TOWER_FIRED: 'towerFired'` to `Events` in
     `data/constants.ts`.
   - Emit at the projectile-spawn site in `CombatSystem.ts` (the
     `_tickProjectiles` neighbour where `game.projectiles.push(...)`
     happens). Payload: `{ towerId, x, y, type }`.
   - Add `TOWER_FIRED: []` to `EVENT_HANDLER_REGISTRY` (no listeners
     yet — populated in Phase 1).
10. **Add `Events.ENEMY_DYING`.** Same pattern: enum key, emit site
    (`killEnemy`), registry entry (`[]` until Phase 2 consumer lands).
11. **Update `EVENT_HANDLER_REGISTRY`** with the two new event keys.
    `npm run event-registry-check` must pass.
12. **Lint-determinism pre-flight.** Run `npm run lint-determinism`
    after the seeded-RNG extraction to confirm no regression in the
    refactor.

**Acceptance.**
- `npm run test`, `npm run arch-check`, `npm run no-raw-px`,
  `npm run event-registry-check`, `npm run lint-determinism`,
  `npm run lint-chinese-comments` all pass.
- Game plays identically to `main` (verified by running three replay
  fixtures from the regression suite frame-for-frame).
- New event keys appear in `data/constants.ts` and in the registry
  with empty listener arrays.

---

### Phase 1 — Projectiles, Impact & Tower Firing (≈1.5 days)

**Goal.** Replace flat-circle projectiles, give every hit a visible
response, give every tower a firing cue.

**Tasks.**

1. **Projectile trail buffer.** Add `history: { x: number; y: number }[]`
   to the Projectile entity (`entities/types.ts:161–172`). Cap length so
   that history older than `ANIM.PROJECTILE_TRAIL` is dropped each tick.
   Populated by `CombatSystem._tickProjectiles`
   (`systems/CombatSystem.ts:55`).
2. **`ProjectileRenderer` rewrite.**
   `frontend/src/renderers/ProjectileRenderer.ts`. Draws:
   - Trail: linearly fading circles along `history` (alpha → 0 over age).
   - Body: tinted radial-gradient halo around `proj.color` + bright core.
   - Variant by source tower type — fetched via `ownerId` lookup against
     `game.towers`. Magic = star-shape spark, Radar C (sniper) = elongated
     streak, Matrix = thin laser segment. Default = halo + core.
3. **`ImpactEffectRenderer`** (new, extends `EffectLayer`).
   Subscribes to `Events.DAMAGE_RESOLVED` in `init(game)`. Spawns
   4–6 short-lived spark particles tinted by attacker's color at the
   damage point. Particles use deterministic seeding from
   `(enemyId, ageInTicks)` so replays are stable.
4. **Enemy hit-flash.** Add `hitFlashAge?: number` to Enemy. Set to 0 in
   `applyDamage` (`domain/combat/SplitPolicy.ts`). Decay in
   `MovementSystem.update`. `EnemyRenderer._drawEnemy` overlays a white
   `globalCompositeOperation = 'screen'` fill at
   `1 - hitFlashAge / ANIM.HIT_FLASH` alpha while > 0.
5. **Tower muzzle flash.** Add `firingFlashAge?: number` to Tower; set on
   `Events.TOWER_FIRED` (new in Phase 0). `TowerRenderer` paints a brief
   outward ring + colored core flash, attenuated by `firingFlashAge`.
6. **Screen shake hookup.** `ShakeController.shake(amplitude, ANIM.SHAKE_HIT)`
   on boss being hit; `shake(largerAmplitude, ANIM.SHAKE_BREACH)` on
   `Events.ENEMY_REACHED_ORIGIN`.

**Acceptance.** Visual diff in dev: every projectile has a trail, every
hit flashes the enemy, every tower visibly fires, every breach shakes the
canvas. Determinism unaffected (run replay regression on three known
seeds).

---

### Phase 2 — Death Animations (≈1 day)

**Goal.** No enemy vanishes instantly. Bosses get a dedicated sequence.

**Tasks.**

1. `Events.ENEMY_DYING` was already wired in Phase 0; Phase 2 only adds
   the consumer renderer. Update its `EVENT_HANDLER_REGISTRY` entry from
   `[]` to list the new subscriber.
2. **`EnemyRenderer` death branch.** When `dyingProgress > 0`, draw the
   slime body with vertical squash (`scaleY = 1 - p`), opacity fade
   (`1 - p`), and slight upward drift. Eyes close into thin lines as
   `p > 0.6`.
3. **`DeathParticleRenderer`** (new, extends `EffectLayer`). Subscribes to
   `ENEMY_DYING`. Spawns 8–14 colored droplet particles radiating outward
   with gravity. Particle count scaled by `enemy.size`.
4. **Boss death sequence.** Implemented as a type-gated branch inside
   `DeathParticleRenderer` (single subscriber to `ENEMY_DYING`,
   branches on `enemy.type === BOSS_A || BOSS_B`). Avoids introducing a
   separate `BOSS_DIED` event — keeps the bus minimal. If a future plan
   needs cross-cutting boss-death reactions (achievement unlocks, audio
   stingers from other modules), add `BOSS_DIED` then.
   - 0.00–0.20s: white bloom centred on boss (`globalCompositeOperation
     = 'lighter'`).
   - 0.20–0.70s: radial shockwave ring expanding to ~3× enemy size.
   - 0.30–1.00s: 30+ particle burst, deterministic per `enemyId`.
   - 0.40–1.20s: boss body fades + sinks. `ShakeController.shake` invoked
     at t=0 with large amplitude.

**Acceptance.** Killing a regular enemy plays a ~350 ms death; killing
Boss A or Boss B plays the full ~1.2 s cinematic. Game logic continues
unaffected during the death window (enemies are `alive = false` from t=0).

---

### Phase 3 — Tower Placement, Upgrade & Idle Animation (≈1 day)

**Goal.** Every tower lifecycle moment is visually rewarded. Tier is
readable at a glance.

**Tasks.**

1. **`TowerLifecycleRenderer`** (new, extends `EffectLayer`).
   - On `Events.TOWER_PLACED`: spawn a "land" effect — concentric ring
     expanding outward + brief downward squash applied to the tower
     (set `placementPopAge` on Tower).
   - On `Events.TOWER_UPGRADED`: spawn a vertical light pillar + radial
     burst tinted to the tower's color; rotating rune ring sweeps once
     around.
2. **Tier visualization.** Add to the tower projection
   (`engine/projections/project-towers.ts`) so the renderer can read tier
   without touching the entity:
   - Tier 1 (level 1): unchanged baseplate.
   - Tier 2 (level 2): adds a gold rim on the baseplate (`#c47206`,
     matches `--gold`).
   - Tier 3 (level 3): adds a slow-rotating outer ring of
     mathematical sub-glyphs around the baseplate.
3. **Idle animation.** Subtle per-tower breath:
   `scale = 1 + sin(t * ω + seedFor(tower.id)) * 0.02`. ω chosen so all
   towers do not pulse in unison. Magic/Calculus already animate their
   orbit ring; this layers underneath.
4. **Placement pop attenuation under reduced motion.** Pop replaced by
   a static flash, no scale change.

**Acceptance.** Placing a tower plays a land effect; upgrading plays a
burst; T2 and T3 are visually distinct from T1; no tower is static.

---

### Phase 4 — HUD Value Feedback (≈1 day)

**Goal.** Gold / HP / score / wave readouts react when they change.

**Coordination note.** This phase touches `HUD.vue` and related panels
that the typography refresh also touches. Sequence with whoever owns
[UI_Typography_Refresh_Plan.md](./UI_Typography_Refresh_Plan.md). The
safest order is: typography Phase 4 (HUD migration) merges first, then
this phase rebases on the new token-based markup. All CSS in this phase
**must** use `--text-*` tokens and `var(--font-mono)` per
`frontend/CLAUDE.md:74–86`.

**Tasks.**

1. **`useValuePop` composable.** Generic hook in
   `frontend/src/composables/useValuePop.ts`. Watches a numeric ref;
   on change, sets `popping = true` for `ANIM.HUD_VALUE_POP` ms and
   exposes a tint direction (`up | down`). No raw px.
2. **HUD bindings.** `HUD.vue` consumes `useValuePop` for `gold`, `hp`,
   `score`, `wave`. Pop animation is a CSS keyframe defined in a
   co-located `<style>` block: `scale(1) → scale(1.18) → scale(1)` over
   the duration, with a brief color flash (`--gold-bright` for up, a new
   `--alert-red` for down).
3. **Wave start banner.** New `WaveBanner.vue` component shown at
   `BUILD → WAVE` transition. Slides in from the top, displays
   `WAVE N` in large mono, lists the wave's enemy mix mini-icons,
   auto-hides at 1.6 s. Listens to phase change event from `gameStore`.
4. **Phase transition fade.** A thin semi-transparent overlay
   (`<PhaseFader />` in `GameView.vue`) blanks 0–300 ms on BUILD→WAVE
   and WAVE→BUILD to bridge the visual jump.

**Acceptance.** Gold gain pops gold, HP loss pops red, wave start shows a
banner. Typography lint passes. Reduced-motion swaps pops for color-only
flash (no scale).

---

### Phase 5 — Math Instrument Towers (≈5 days)

**Goal.** Replace the seven tower bodies with a unified
"mathematical instrument" vocabulary. Baseplate, glyph, and tier rings
from Phase 3 are kept; only the body changes.

**Shared rules established up-front.**

- **Common silhouette.** All instrument bodies fit a 22 × 22 px bounding
  box centred above the baseplate. This prevents the current
  "every tower a different size" feeling.
- **Common palette discipline.** Each tower uses its `Colors.*` hue as
  the *primary*, plus dark slate (`--stone-dark`) as structure, plus
  white at low alpha for highlights. No tower introduces a third hue.
- **Common animation envelope.** Every instrument has a 2 s idle loop
  (rotation, oscillation, or pulse) that telegraphs its function.
- **Firing animation.** Tied to `Events.TOWER_FIRED` from Phase 1.

**Per-tower sub-phases.**

- **5a — Magic Tower (`✦`, purple).** Replace orbit-ring + crystal with
  a small floating polynomial / sinusoid curve drawn over a parchment
  scroll. Curve animates: amplitude breathes; on fire, the curve flashes
  and emits a spell glyph that travels with the projectile.
- **5b — Radar A (Sweep) / B (Rapid) / C (Sniper).** Recast as classical
  navigation instruments rather than military hardware. A = a sextant
  whose arm sweeps idle; B = an astrolabe with two concentric rings
  rotating opposite directions; C = a brass telescope on a tripod that
  visibly tracks the nearest enemy with an angle update each frame.
- **5c — Matrix Tower (`⊞`).** A floating 2 × 2 bracket pair `[ ]` with
  four cells; cells hold tiny scrolling digits (deterministic, seeded by
  `tower.id`). On fire, two cells flash and a brief beam connects to the
  target.
- **5d — Limit Tower (`∞`).** Two vertical asymptote lines (dashed) flank
  a point that visibly ascends from below and gets arbitrarily close to
  the upper bound without crossing it. On fire, the point briefly snaps
  to the bound and the asymptotes pulse.
- **5e — Calculus Tower (`∫`).** A large rotating ∫ sigil sits centred;
  on fire, it sheds small `dx` / `dy` particles that fly toward the
  target. Idle: gentle rotation + a thin gradient indicating "area
  under curve".

**Per-tower task shape.**

For each instrument:
1. Replace the corresponding `_draw<Name>Tower` method in
   `TowerRenderer.ts`.
2. Extend `engine/projections/project-towers.ts` with any new
   per-tower view fields (e.g., `sweepAngle`, `matrixCellValues`). Per-
   tower state lives on the Tower entity and is ticked in the
   corresponding existing per-tower system — **there is no
   `TowerCombatSystem`**; the five systems are `MagicTowerSystem`,
   `RadarTowerSystem`, `MatrixTowerSystem`, `LimitTowerSystem`,
   `CalculusTowerSystem` (see `register-systems.ts:77–81`). For purely
   cosmetic state (e.g., idle sweep angle) prefer deriving from
   `game.time + seedFor(tower.id)` inside the projection — no system
   tick needed.
3. **Required UI-shadow updates** (do not defer — these visibly
   diverge from in-canvas art the moment the body changes):
   - **`TowerBar.vue`**: replace the colored-hexagon icon with a
     scaled-down version of the new instrument silhouette. Use the
     same draw helpers extracted in Track A so the bar icon and the
     in-canvas tower stay in lock-step.
   - **`TowerInfoPanel.vue`**: panel preview chip becomes a small
     instrument preview, not just a color swatch.
   - **`ManualModal.vue` + `utils/manualSections.ts`**: if any section
     describes or illustrates the old tower body, rewrite. Grep for
     each `TowerType` enum value in `manualSections.ts` before merging.
4. **Per-tower minimum test.** A render-smoke test that constructs a
   tower at fixed coordinates and confirms the new draw method runs
   without throwing under a mocked `CanvasRenderingContext2D`. Lives
   alongside `TowerRenderer.test.ts` if it exists, otherwise new file.

**Acceptance.** All seven towers share a coherent visual language. Each
has a distinguishable silhouette at a glance. Idle animations are
non-distracting. `TowerBar`, `TowerInfoPanel`, and the manual all show
the new instruments — no screen still shows the old geometry.
`npm run test` green (deterministic seeded RNG keeps replay regression
green).

---

### Phase 6 — Math Chaos Enemies (≈6 days)

**Goal.** Replace the slime-with-accessories template with a roster of
"errors and chaos" creatures. The redesign is per-enemy, but a unified
construction vocabulary keeps them cohesive.

**Shared rules.**

- **Construction kit.** Every enemy is built from three primitives:
  (1) a glyph body — a large LaTeX-like math symbol forming the silhouette;
  (2) a chromatic-aberration fringe (cyan/magenta) signalling "this is an
  error"; (3) a motion modifier (jitter, drift, rotation) tied to its
  behaviour.
- **No faces.** The kawaii eyes+mouth treatment is dropped wholesale.
  Identity comes from glyph + motion + color, not personality.
- **Status auras retained.** Frost overlay, regen aura, helper aura, and
  shield bar from the current `EnemyRenderer` are kept (they are
  best-in-class). They simply apply to the new glyph bodies.

**Per-enemy sub-phases.**

- **6a — General (`x` unknown) & Fast (`÷`).** Walker built from a tall
  `x` glyph with a slight gait wobble. Fast is a leaning `÷` that drags
  a motion-blur streak.
- **6b — Strong (tangled equation block).** A small cluster of operators
  `( + − = )` arranged as a knotted square; chromatic fringe pulses with
  HP.
- **6c — Split (fraction).** A horizontal vinculum with a numerator
  glyph above and denominator below; on split-death, the fraction
  literally separates into two halved-size fractions.
- **6d — Helper (`Σ` summation) & Regenerator (`lim`).** Helper carries a
  `Σ` body whose existing pale aura (now retained) buffs neighbours; the
  glyph subtly enlarges as it absorbs. Regenerator's `lim` glyph has the
  existing rotating-dashed ring; the cross particles become `+ε` glyphs
  rising upward.
- **6e — Bulwark (`∥` parallel walls) & Swarmling (`ε`).** Bulwark is two
  thick parallel bars (`∥`) with rivets; the existing pauldron concept
  transplants well. Swarmling is a tiny `ε` with the existing orbiting
  satellites recast as smaller `ε` glyphs.
- **6f — Boss A (unsolvable equation) & Boss B (paradox loop).** Boss A
  is a large composite equation (`∀x. f(x) ≠ 0`) hovering as the body,
  crown becomes a halo of "QED" boxes that flicker. Boss B is a
  Möbius-style strip continuously folding into itself, halo replaced by
  an orbiting "↻" symbol.

**Per-enemy task shape.**

For each enemy:
1. Replace the corresponding `_draw<Type>Details` method in
   `EnemyRenderer.ts`. Remove the `_drawSlimeBody`,
   `_drawFace`, `_drawGloss` calls from its branch when the new body
   takes over (these methods stay defined — other enemies still use them
   during the phase rollout).
2. Glyph rendering helper added to `renderers/primitives.ts`:
   `drawGlyphBody(ctx, x, y, size, glyph, color, options)`. Centralises
   the chromatic-fringe + stroke-then-fill recipe. Specify font fallback
   chain explicitly — Unicode math glyphs render differently across
   systems; use the existing `var(--font-mono)` rune face and add
   `'Cambria Math', 'STIX Two Math', serif` for the canvas `ctx.font`.
3. Frost/regen/helper auras and HP/shield bars remain untouched; verify
   they still anchor correctly on the new body bounds (bounds may shift
   because glyph height differs from the slime body's radius).
4. **Required UI-shadow updates:**
   - **`WaveForecast.vue`**: mini enemy icons in the wave preview must
     re-render with the new glyph bodies. The forecast uses miniature
     versions of the same draw methods — once `_draw<Type>Details`
     changes, the forecast updates automatically *if* the same path is
     used. Verify; if forecast has its own draw path, port the change.
   - **`ManualModal.vue` + `utils/manualSections.ts`**: as Phase 5, grep
     for each `EnemyType` enum value and update text/diagrams.
   - **Buff-card / achievement text** that references "slimes" by name
     anywhere (`grep -ri 'slime' frontend/src/`): rename to neutral
     "enemies" or "creatures".
5. **Per-enemy minimum test.** Render-smoke test analogous to Phase 5.

**Acceptance.** All ten enemy types replaced. Slime template no longer
referenced from any active branch (the methods can stay defined; a
follow-up cleanup PR removes them). Boss A and Boss B feel distinct from
regular enemies in silhouette and motion. `WaveForecast` and manual show
the new bodies.

---

### Phase 6.5 — Pet Visual Alignment (≈1 day, or explicit deferral)

**Why.** Pets (`renderers/PetRenderer.ts`, `entities/PetFactory.ts`,
`systems/PetCombatSystem.ts`) are combat entities visible on the same
field as towers and enemies. Leaving them on the original art after
Phases 5–6 creates a third visual style at odds with both.

**Decision point.** Either:

- **6.5-A — Align (recommended).** Recast pets as "helper symbols" in
  the math-error vocabulary: a small `+1` cursor pet, a `Σ` collector,
  etc. Same chromatic discipline as enemies (two-hue + fringe), but
  *cyan* fringe instead of cyan/magenta so allied vs hostile reads at a
  glance. ~1 day.
- **6.5-B — Defer.** Explicitly out-of-scope this plan; raise as a
  follow-up doc. Acceptable only if pet usage is rare enough to be
  invisible in 90% of sessions. **Confirm with the gameplay owner
  before choosing this path.**

Either way, this section must end with a recorded decision (which option
was taken, and why) added to the spec delta in Phase 7.

---

### Phase 7 — Polish, Reduced Motion & Performance (≈2 days)

**Goal.** Settle timings, honour user preferences, verify performance,
update the spec.

**Tasks.**

1. **Timing tuning.** Single-file pass on `ANIM` constants. Playtest at
   the two `perceivedSpeedMultiplier` settings — 1× and 2× (toggled by
   `GameSpeedPanel.vue`, value at `GameSpeedPanel.vue:15`). Durations
   that feel right at 1× often feel sluggish at 2×. Scale `ANIM.*` by
   `1 / perceivedSpeedMultiplier` where the animation is gameplay-
   coupled (enemy death, projectile trail) and leave cosmetic anims
   (HUD pop, placement burst) at 1×.
2. **Reduced motion.** Add `useReducedMotion` composable reading
   `matchMedia('(prefers-reduced-motion: reduce)')` once at boot. Wire
   into:
   - `ShakeController` (zero amplitude).
   - `HudValuePop` (color flash only, no scale).
   - `DeathParticleRenderer` (50% particle count, half lifetime).
   - `TowerLifecycleRenderer` (static flash instead of pop).
3. **Performance pass.** Profile in dev with 100 enemies + 20 towers +
   full effect load. Target ≥ 55 fps on a mid-range laptop. If under,
   the prime suspects are particle counts in `DeathParticleRenderer` and
   per-frame array growth in `ProjectileRenderer.history`. Pre-allocate.
4. **Spec update.** Append a §4-delta to `Math_Defense_Spec.md`
   summarising the new visual vocabulary. Replace any obsolete colour or
   silhouette table rows.
5. **Memory entry.** Add a `project_visual_redesign.md` memory pointer
   so future sessions can find this plan and its status.

**Acceptance.** All tests green. `npm run no-raw-px`,
`npm run arch-check`, `npm run lint` clean. Manual playtest at both
speeds. Reduced-motion mode visibly different but functional.

---

## Tower-Attached VFX Alignment

Phase 5 rewrites tower bodies, but several **per-tower visual companions
rendered by other systems** stay on their original art unless explicitly
addressed. Each tower instrument must be reviewed against:

- `MagicZoneRenderer.ts` — magic-curve zone-of-effect overlay.
- `RadarRangeRenderer.ts` — radar range / detection arc shown on
  selection and during fire.
- `MatrixLaserRenderer.ts` — matrix-tower beam to target.
- The placement range-circle preview drawn during `BUILD` phase when a
  tower is selected (location: `TowerPlacementSystem` or its renderer).

**Per-instrument task during Phase 5 sub-phases:**

| Instrument | Companion to verify |
|------------|---------------------|
| Magic (5a) | `MagicZoneRenderer` — the function-curve zone must match the new top-deck curve aesthetic. |
| Radar A/B/C (5b) | `RadarRangeRenderer` — sweep / rotating-ring / scope cone style should mirror the new instrument body. |
| Matrix (5c) | `MatrixLaserRenderer` — laser endpoints, colour, and the small target-flash should match the new bracket art. |
| Limit (5d) | Range preview only. |
| Calculus (5e) | Range preview only; consider whether shed `dx`/`dy` particles overlap with `SpellEffectRenderer`'s domain (they should not — these particles are tower-attached, not spell-attached). |

If any companion cannot land inside its parent sub-phase, **defer the
sub-phase** rather than ship a mismatched companion. Mismatch is more
visible than absence.

## Spell Visual Direction

Spells (`SpellEffectRenderer.ts`, `data/spell-defs.ts`) are part of the
combat surface and would visibly clash with the math-theme towers /
enemies in Track B if left untouched. This plan **explicitly defers spell
re-skinning to a follow-up plan** to keep this one tractable.

The follow-up plan should arrive within one milestone after Phase 6 ships
so the visual mismatch window is short. Until then, accept the
inconsistency as a known limitation and document it in the spec delta.

## Audio Coupling

This plan introduces visual events (`TOWER_FIRED` in particular) that
`useEngineAudio.ts` could opt into for muzzle SFX, hit stingers, death
sounds, boss-death cues. **All audio decisions are explicitly out of
scope** and tracked in a sibling Audio Polish plan (TBD). The plan
authors will hand the new event list to the audio owner at the end of
Phase 0 so they can scope independently.

## Replay Compatibility

Track A adds two new entity fields (`Projectile.history: { x, y }[]` and
`Enemy.dying / dyingTimer / deathMaxTime / hitFlashAge`). The replay
system records **events**, not entity snapshots
(`engine/replay/EventRecorder.ts`); regenerating a session re-runs the
event stream from seeds. Adding cosmetic state to entities does **not**
require a `replayVersion` bump, because the recorded event stream is
unchanged. **However**, if Phase 1 emits `TOWER_FIRED` and that event is
captured by the recorder, recordings made after this change will not
replay against pre-change builds — assess whether `EventRecorder` filters
its capture list before merging Phase 1, and update the filter
explicitly if needed.

## Risk Register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Phase 5/6 art quality varies tower-to-tower because each sub-phase is implemented in isolation. | Medium | Land Phase 5a and 6a first; do a design review of the result before continuing. Other sub-phases must match that quality bar. |
| `prefers-reduced-motion` users get a strictly worse experience. | Low | Phase 7 explicitly leaves identity-bearing visuals (silhouette, colour, glyph) intact; only motion intensity is reduced. |
| Determinism regression from new RNG in particle systems. | Medium | All randomness routes through `seededUnit(seedFor(...))`. Replay regression suite runs at end of every phase. |
| Conflict with typography refresh on `HUD.vue`. | Medium | Phase 4 explicitly sequences after typography Phase 4. Cross-check before opening the PR. |
| Procedural canvas hits an art ceiling on Phase 6 boss redesigns. | Medium | If the boss glyph-composite proves too hard to render cleanly with `ctx.*` primitives, a single per-boss path-cached `OffscreenCanvas` is permitted as a per-boss escape hatch (still procedural, just memoised). No external assets. |
| Effect count tanks frame rate. | Low–Medium | Phase 7 includes a perf pass and pre-allocation pattern. Particle counts already scale by enemy size, not arbitrary. |
| `_drawSlimeBody` / `_drawFace` left behind as dead code after Phase 6. | Low | Cleanup PR ratchets removal once all enemies are migrated; safe because the methods are private to `EnemyRenderer`. |
| Forgotten `EVENT_HANDLER_REGISTRY` update blocks CI on every effect-renderer PR. | High | Phase 0 codifies the rule; PR template should call it out. Every reviewer is responsible for cross-checking. |
| New event subscriptions in renderers leak across level restarts. | Medium | `EffectLayer` base subscribes to `LEVEL_START` and calls `clear()` for every subclass. Smoke test: spawn effects, fire `LEVEL_START`, assert effect arrays are empty. |
| Companion VFX (`MagicZoneRenderer`, `RadarRangeRenderer`, `MatrixLaserRenderer`) left on old style after Phase 5. | Medium | "Tower-Attached VFX Alignment" section gates each sub-phase on companion update. |
| Pet visuals create a third style if Phase 6.5 is deferred. | Medium | Decision required at Phase 6 close; default is 6.5-A (align). Deferral requires gameplay-owner sign-off. |
| Spell VFX mismatch with new towers/enemies until follow-up plan. | Medium | Acknowledged limitation; spec delta documents the gap and links to the follow-up. Window kept to one milestone. |
| `TOWER_FIRED` recordings become incompatible with pre-Phase-1 builds. | Low | Replay compatibility section instructs a check of `EventRecorder` capture filter before Phase 1 merges. |
| Unicode math glyph fallback varies by OS, breaking the enemy silhouette. | Medium | Phase 6 task 2 fixes the canvas font fallback chain explicitly; CI render-smoke test catches missing-glyph regression on a known-good baseline. |

---

## Acceptance Criteria (Whole Plan)

- All seven towers and all ten enemies use the new visual vocabulary.
- `TowerBar`, `TowerInfoPanel`, `WaveForecast`, and the `ManualModal`
  show the same redesigned bodies — no UI surface still shows old art.
- Pet visual decision (Phase 6.5) recorded in the spec delta.
- Every player-meaningful event (fire, hit, kill, place, upgrade, breach,
  HP/gold change, wave start) has a visible reaction.
- Boss death and origin breach trigger shake; nothing else does.
- No raw `font-size: NNpx` introduced; all numeric readouts carry
  `var(--font-mono)`.
- `prefers-reduced-motion` honoured.
- Three saved replays from the regression suite reproduce frame-for-frame.
- Every new `eventBus.on(...)` has a matching entry in
  `engine/event-handlers/registry.ts`.
- All new files / touched files carry English-only comments.
- `npm run test`, `npm run arch-check`, `npm run no-raw-px`,
  `npm run event-registry-check`, `npm run lint-determinism`,
  `npm run lint-chinese-comments`, `npm run lint` all pass.

---

## Appendix A — File Touchpoint Index

| File | Phase | Change |
|------|-------|--------|
| `frontend/src/data/constants.ts` | 0, 7 | Add `ANIM`; add `Events.TOWER_FIRED`, `Events.ENEMY_DYING`; tune in Phase 7. |
| `frontend/src/entities/types.ts` | 0, 1 | Enemy: `dying`, `dyingTimer`, `deathMaxTime`, `hitFlashAge`. Tower: `firingFlashAge`, `placementPopAge`. Projectile: `history`. |
| `frontend/src/engine/Game.ts` | 0 | Wire `ShakeController` into `_render` (line 555). |
| `frontend/src/engine/ShakeController.ts` | 0 | New module. |
| `frontend/src/engine/event-handlers/registry.ts` | 0–4 | Add entries for every new subscription introduced in each phase. CI-gated. |
| `frontend/src/engine/register-systems.ts` | 1, 2, 3, 4 | Register new renderers at z-order positions documented in "Renderer registration order". |
| `frontend/src/engine/projections/project-enemies.ts` | 0, 1, 6 | Add `dyingProgress`, `hitFlashAge`; include dying enemies in view; update view fields for new enemy bodies. |
| `frontend/src/engine/projections/project-towers.ts` | 3, 5 | Add tier ring state, per-instrument view fields. |
| `frontend/src/engine/projections/views.ts` | 0, 3, 5 | Field additions. |
| `frontend/src/engine/replay/EventRecorder.ts` | 1 | Verify `TOWER_FIRED` filter posture before merging Phase 1. |
| `frontend/src/math/seededRandom.ts` | 0 | New — extracted from `SpellEffectRenderer`. |
| `frontend/src/systems/MovementSystem.ts` | 0 | Dying-skip; new removal predicate. |
| `frontend/src/systems/CombatSystem.ts` | 0, 1 | Emit `TOWER_FIRED` (Phase 0); populate projectile history (Phase 1). |
| `frontend/src/systems/LimitTowerSystem.ts` | 0 | Confirm `killEnemy()` path is the only kill route (no shortcut bypass). |
| `frontend/src/domain/combat/SplitPolicy.ts` | 0 | Set dying state; emit `ENEMY_DYING`. |
| `frontend/src/renderers/SpellEffectRenderer.ts` | 0 | Refactor to import `seededUnit` / `seedFor` from the new shared module. |
| `frontend/src/renderers/effects/EffectLayer.ts` | 0 | New base with `LEVEL_START → clear()` wiring. |
| `frontend/src/renderers/ProjectileRenderer.ts` | 1 | Rewrite. |
| `frontend/src/renderers/ImpactEffectRenderer.ts` | 1 | New. |
| `frontend/src/renderers/DeathParticleRenderer.ts` | 2 | New (regular + boss branches). |
| `frontend/src/renderers/TowerLifecycleRenderer.ts` | 3 | New. |
| `frontend/src/renderers/TowerRenderer.ts` | 1, 3, 5 | Muzzle flash, tier visuals, instrument bodies. |
| `frontend/src/renderers/EnemyRenderer.ts` | 1, 2, 6 | Hit flash, death drawing, glyph bodies. |
| `frontend/src/renderers/MagicZoneRenderer.ts` | 5a | Align curve style to new Magic instrument. |
| `frontend/src/renderers/RadarRangeRenderer.ts` | 5b | Align sweep / arc style to new Radar instruments. |
| `frontend/src/renderers/MatrixLaserRenderer.ts` | 5c | Align laser style to new Matrix bracket. |
| `frontend/src/renderers/PetRenderer.ts` | 6.5 | Align (option A) or leave + document (option B). |
| `frontend/src/renderers/primitives.ts` | 6 | `drawGlyphBody` helper with explicit font fallback chain. |
| `frontend/src/components/game/HUD.vue` | 4 | Value-pop bindings; tokenised CSS. |
| `frontend/src/components/game/WaveBanner.vue` | 4 | New. |
| `frontend/src/components/game/PhaseFader.vue` | 4 | New. |
| `frontend/src/components/game/TowerBar.vue` | 5 | Icon = mini-instrument silhouette (one row per sub-phase). |
| `frontend/src/components/game/TowerInfoPanel.vue` | 5 | Preview chip becomes mini-instrument. |
| `frontend/src/components/game/WaveForecast.vue` | 6 | Verify (or port) enemy mini-icon path. |
| `frontend/src/components/common/ManualModal.vue` | 5, 6 | Update sections referencing old tower / enemy art. |
| `frontend/src/utils/manualSections.ts` | 5, 6 | Same — grep for each enum value before merging. |
| `frontend/src/composables/useValuePop.ts` | 4 | New. |
| `frontend/src/composables/useReducedMotion.ts` | 7 | New. |
| `Math_Defense_Spec.md` | 7 | Append §4-delta (visual vocabulary, Pet decision, deferred Spell re-skin). |

## Appendix B — Naming Conventions

- New renderers end in `Renderer` (existing convention).
- New effect-layer subclasses end in `EffectRenderer` to signal their
  shared base.
- Animation duration constants live under `ANIM.*`. Never inline a
  numeric duration in a renderer.
- New events use the existing `Events.*` enum and SCREAMING_SNAKE_CASE.
