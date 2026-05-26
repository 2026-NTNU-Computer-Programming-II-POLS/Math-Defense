# Balance Baseline — Pre-Overhaul Snapshot (2026-05)

> Captured during Phase 0 of the [Balance Overhaul Plan](balance-overhaul-plan.md). These numbers represent the "before" picture used by Phase 8 validation. **Do not edit values once the overhaul lands** — instead create a sibling `balance-after-2026-05.md` for the post-overhaul measurements.

Captured against branch `feat/balance-overhaul-2026-05` at HEAD `183e277` (the tip of `main` at branch-creation time).

---

## 1. Anti-cheat constraints (Phase 2 starting point)

Pulled from `backend/app/domain/constraints.py` at audit time. Phase 2's "Constraints Audit" step re-checks these after the new score formula lands; if the new realistic max at a given level exceeds the value below, the cap must be raised before merge.

| Constant | Location | Current value |
|---|---|---|
| `TOTAL_SCORE_MAX` | `constraints.py:22` | `1_000_000.0` |
| `MAX_SCORE_DELTA` (per-wave) | `constraints.py:44` | `50_000` |
| `MAX_WAVE` | `constraints.py:43` | `30` |

### `LEVEL_MAX_SCORES` (constraints.py:50)

| Star | Cap |
|---|---|
| 1 | 5,000 |
| 2 | 10,000 |
| 3 | 15,000 |
| 4 | 50,000 |
| 5 | 100,000 |

### `LEVEL_MAX_KILLS` (constraints.py:58)

| Star | Cap |
|---|---|
| 1 | 50 |
| 2 | 100 |
| 3 | 200 |
| 4 | 300 |
| 5 | 500 |

### `LEVEL_MAX_WAVES` (constraints.py:66)

| Star | Cap |
|---|---|
| 1 | 3 |
| 2 | 4 |
| 3 | 5 |
| 4 | 5 |
| 5 | 6 |

---

## 2. Replay baselines (manual capture — TODO)

Plan calls for ~20 representative runs per star level. Each row records the final state of a completed run on the **pre-overhaul** build. Fill in by playing through each level. The same template will be re-filled post-overhaul in `balance-after-2026-05.md` and the two diffed during Phase 8.

Capture instructions:
- Use the in-game replay capture (or a screen recording if persisted replays aren't sufficient) so a contested row can be re-verified later.
- For each row, note the build (towers placed + talents allocated) under `Notes` so a regression can be traced to its cause.
- `Pet count` is the spawn count from Calculus tower at game end (post-Q12 this drops sharply at high-coefficient builds — that's the key signal).
- `TP spent` is the total talent points consumed across the run's allocation snapshot.

### 1★

| # | Final score | Total gold earned | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
| 19 |  |  |  |  |  |
| 20 |  |  |  |  |  |

### 2★

| # | Final score | Total gold earned | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
| 19 |  |  |  |  |  |
| 20 |  |  |  |  |  |

### 3★

| # | Final score | Total gold earned | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
| 19 |  |  |  |  |  |
| 20 |  |  |  |  |  |

### 4★

| # | Final score | Total gold earned | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
| 19 |  |  |  |  |  |
| 20 |  |  |  |  |  |

### 5★

| # | Final score | Total gold earned | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
| 19 |  |  |  |  |  |
| 20 |  |  |  |  |  |

---

## 3. Aggregate observations

Fill in after the per-row tables are populated — these are the summary stats Phase 8 will pivot against.

| Metric | 1★ | 2★ | 3★ | 4★ | 5★ |
|---|---|---|---|---|---|
| Median final score |  |  |  |  |  |
| Max final score |  |  |  |  |  |
| Median gold earned |  |  |  |  |  |
| Median pet count |  |  |  |  |  |
| Builds using Calculus (n/20) |  |  |  |  |  |
| Builds using MAGIC (n/20) |  |  |  |  |  |
| Builds using LIMIT (n/20) |  |  |  |  |  |

---

*End of baseline.*
