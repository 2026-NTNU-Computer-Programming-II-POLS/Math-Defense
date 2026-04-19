# Technical-Debt Ledger

> Canonical ledger of shims, flags, and audit scripts introduced by in-flight
> features. Each row names its own removal date. `scripts/check-debt-ledger.ts`
> (landing in Phase 1 of the Piecewise Paths feature) fails CI on any entry
> whose `Scheduled removal` is in the past.
>
> **No entry is open-ended.** Deadline extensions are allowed only in writing
> and must carry a new dated deadline.

## Active entries

| Item | Introduced | Scheduled removal | Owner | Phase that closes |
|---|---|---|---|---|
| `SEGMENTED_PATHS_ENABLED` flag | Phase 1 (Piecewise Paths) | ship-date + 14d | Feature owner | Phase 7 |
| Legacy `MovementSystem` branch under `!SEGMENTED_PATHS_ENABLED` (incl. `Game.MovementLevelContext` stub, `_pathX` mirror in `_advanceSegmented`) | Phase 2 (Piecewise Paths) | ship-date + 14d | Feature owner | Phase 7 |
| Legacy `TowerPlacementSystem` rule branch under `!(SEGMENTED_PATHS_ENABLED && game.levelContext)` (inline gold + occupied checks) | Phase 3 (Piecewise Paths) | ship-date + 14d | Feature owner | Phase 7 |
| `arch-check` allowlist: HUD.vue → @/domain/formatters | Phase 1 (Piecewise Paths) | Phase 5 | Feature owner | Phase 5 |
| Legacy `EnemyFactory` uses `game.pathFunction` for initial enemy y (one-frame y-snap when segmented path disagrees at spawn x) | Phase 6 (Piecewise Paths) | ship-date + 14d | Feature owner | Phase 7 (legacy pathFn removal) |
| `Game.pathFunction` field + `pathExpression` store slice (legacy path pipeline) | (pre-existing) | ship-date + 14d | Feature owner | Phase 7 |
| `generate*` random path generators + `PathDef` in `math/PathEvaluator.ts` | (pre-existing) | ship-date + 14d | Feature owner | Phase 7 |
| `scripts/lint-chinese-comments.ts` legacy allowlist (11 pre-existing files with non-ASCII comments) | Phase 6 (Piecewise Paths) | ship-date + 30d | Feature owner | Phase 7 / follow-up translation PRs |

## Retired entries

| Item | Introduced | Retired | Retired by |
|---|---|---|---|
| `EnemySpawnEntry.overrides` field | (pre-existing) | Phase 6 (Piecewise Paths) | Field deleted from `data/level-defs.ts`; audit (grep for `config.overrides` across `src/`) confirmed no level used it. `createEnemy` signature simplified to positional `startX`/`targetX` defaults. |
| `scripts/audit-overrides.ts` | Phase 6 (planned) | Phase 6 (never created) | Audit performed inline via grep; no standalone script was committed, so there is nothing to delete. |
| `useGameLoop.hasPathLayout` duck-type guard | Phase 3 (Piecewise Paths) | Phase 6 (Piecewise Paths) | Guard deleted in `useGameLoop.ts` now that every `LevelDef` in `LEVELS` carries `path` + `buildablePositions`. |

## Governance

- Every row must name the Item, when it was Introduced, a dated Scheduled
  removal, the Owner accountable, and the Phase that closes it.
- `ship-date` resolves to the UTC calendar date of the Phase 6 merge commit
  that flips `SEGMENTED_PATHS_ENABLED = true`. All `ship-date + Nd` deadlines
  in this ledger resolve against that date.
- A row moves to **Retired entries** only when its symbol is deleted from the
  repo and the closing commit is linked in the row.
- To extend a deadline, open a PR that replaces the `Scheduled removal` with
  a new dated value and links the rationale. Silent slips are not allowed.
