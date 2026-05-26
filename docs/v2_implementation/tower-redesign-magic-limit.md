# Phase 6 — MAGIC + LIMIT Redesign Note

> **Branch:** `feat/balance-overhaul-2026-05`
> **Phase:** 6 of 8 (see `balance-overhaul-plan.md`)
> **Status:** Approved — implementation in this commit
> **Generated:** 2026-05-27

Phase 6 of the balance overhaul addresses tower differentiation: MAGIC and LIMIT were too easily dominated by Radar towers. This note records the design choices made for Q7 (MAGIC) and Q8 (LIMIT) before any code edits.

The plan called out two **open questions requiring decisions**:
1. MAGIC slow stacking semantics — refresh vs. stack.
2. LIMIT mechanic choice — pierce vs. burst.

Both are resolved below.

---

## Q7 — MAGIC: AoE damage + slow

### What was already true

The plan's pre-work step "**Locate `MagicTowerSystem`**" implied uncertainty about whether MAGIC was its own system. It is — `frontend/src/systems/MagicTowerSystem.ts`. The current `_applyDebuff` path already:

- Enumerates alive enemies near the chosen curve (`|enemy.y − f(enemy.x)| < zoneWidth`) and inside `tower.effectiveRange`.
- Applies a slow (`enemy.slowFactor = max(existing, 0.4)` — i.e. 60% effective speed).
- Applies a damage-over-time tick (`enemy.dotDamage = effectiveDamage × strengthMult`, ticked by `CombatSystem._tickDoT`).
- Is cooldown-gated so DoT doesn't stack every frame.

Buff mode (which boosts other towers near the curve) is unchanged and stays the toggle-able counterpart to debuff.

### Decisions

| Aspect | Decision | Rationale |
|---|---|---|
| Slow factor | Stay at **0.4** (60% effective speed) | Matches the plan's "Slow factor: 0.4, 40% reduction" intent. Already in code. |
| Slow base duration | **2.0 s** (was 1.0 s, tied to DoT duration) | Plan calls for 2 s. Decoupling means the slow lingers past the cooldown window so consecutive hits stay slowed without gaps. |
| DoT base duration | Stay at **1.0 s** | Per-tick DoT damage already balances against the 1.0 s cooldown — bumping it would double-count damage when re-hit. |
| Talent scaling | Both slow and DoT use `× (1 + duration mod)` | Single talent surface; no new mod string introduced. |
| Stacking semantics | **Refresh on re-hit, no stack** | Open question #2 resolved: re-applying slow overwrites `slowTimer` and uses `max()` on `slowFactor`. Multiple MAGIC towers covering the same enemy do not push the slow factor past 0.4. Simpler tuning surface. |
| Buff mode | Preserved unchanged | Toggle still works; buff zone radius and stacking semantics unchanged. |

### Files changed

- `frontend/src/systems/MagicTowerSystem.ts` — introduce `SLOW_DURATION = 2.0` and set `enemy.slowTimer = SLOW_DURATION * (1 + duration mod)` separately from `enemy.dotTimer`.
- `frontend/src/systems/__tests__/MagicTowerSystem.test.ts` — new file covering debuff zone, slow application, range/zone gating, cooldown gating, buff zone, disabled/unconfigured no-op.
- `frontend/src/data/tower-defs.ts` — description mentions the 2 s slow.
- `frontend/public/manual/towers-and-enemies.md` — same.

---

## Q8 — LIMIT: charge-up burst

### What was already true

The current `LimitTowerSystem.update()`:

- Has a 3.0 s cooldown (the longest in the roster).
- On each fire, hits **every** alive enemy in range with the same damage formula. That is, LIMIT is already an AoE tower; it just does not advertise itself as one and has no charge-up identity.
- Outcome → damage mapping (after V3 de-fear): `+∞` instakills (bypasses defensive modifiers), `+C` deals `effectiveDamage × |value|`, the four "wrong / degenerate" outcomes (`zero`, `constant`, `-c`, `-inf`) chip for `effectiveDamage × 0.10`.

The plan's two design options:
- **Pierce**: 3-target beam in a line.
- **Burst**: 3 s charge then AoE blast at 1.5×.

### Decision

**Burst** (selected by gameplay design owner on 2026-05-27).

| Aspect | Decision | Rationale |
|---|---|---|
| Charge cadence | **3.0 s** (already the cooldown) | The existing cooldown serves as the charge window. No new field; renderers can read `1 − cooldownTimer / cooldown` as the charge progress. |
| Burst multiplier | **1.5×** applied to every burst hit | Per the plan. Pinned as a tower-def constant so a future talent can tweak it. |
| AoE shape | Unchanged — **circular range** (`tower.effectiveRange`) | LIMIT was already circular AoE. Keeping the shape preserves placement intuition; the change is the multiplier + the charge identity, not geometry. |
| `+∞` interaction | Multiplier does **not** apply to `+∞` (still an instakill) | Multiplying infinity is meaningless; the instakill path stays bypass-everything. |
| Chip damage | Multiplier **does** apply (`0.10 × 1.5 = 0.15`) | Keeps the formula one-line. The wrong-answer chip stays small enough that mis-answers still feel costly. |
| Charge identity | Renderer reads `chargeProgress` from cooldown timer | No new state field; the visual is layered on top of existing timing. (Renderer work itself is out of scope for this commit — the data is available when the renderer wants it.) |

### Why not pierce

The Pierce design would have been a clean differentiator but is a strict **nerf** from "unlimited AoE every 3 s" to "3 enemies in a line every 3 s". Burst keeps LIMIT's existing wave-clear feel and adds a damage payoff that justifies the long cooldown — closer to how the tower is already played, with a sharper identity.

### Files changed

- `frontend/src/data/tower-defs.ts` — LIMIT description mentions the 1.5× burst; consider future `extra.burstMultiplier` tier bump.
- `frontend/src/systems/LimitTowerSystem.ts` — multiply final damage by `BURST_MULTIPLIER` (except `+∞`).
- `frontend/src/systems/__tests__/LimitTowerSystem.test.ts` — update existing `+c` and chip-damage assertions to the 1.5× values; add an explicit "burst multiplier applies" test.
- `frontend/public/manual/towers-and-enemies.md` — fix stale `−C / −∞ = heal` wording (V3 de-fear already chips; doc was never updated) and mention the burst multiplier.

---

## Rollback

Phase 6 changes are pure code + data; no migration, no fixture regen. Reverting the commit cleanly restores the prior MAGIC slow timing and LIMIT damage formula. No persisted state references the new constants.

---

*End of design note.*
