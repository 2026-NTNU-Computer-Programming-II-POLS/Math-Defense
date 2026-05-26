# Balance After — Post-Overhaul Snapshot (2026-05)

> Phase 8 deliverable from the [Balance Overhaul Plan](balance-overhaul-plan.md). Diffs the live state against the [pre-overhaul baseline](balance-baseline-2026-05.md).
>
> Captured against branch `feat/balance-overhaul-2026-05` at HEAD `f8a24f9` (10 commits ahead of `main` at `183e277`). All automated checks below are reproducible from a clean checkout; the manual replay tables are intentionally left empty for the playtester to fill before merge (see §4).

---

## 1. Anti-cheat constraints — Phase 2 audit result

The Phase 2 scoring rewrite (Q1 sqrt-softened exponent + Q3 continuous K blend) needed a re-check against `LEVEL_MAX_SCORES` in `backend/app/domain/constraints.py`. **No cap changes were required** — the new formula stays comfortably under every existing cap, with substantial headroom.

### Realistic perfect-play scores per level (post-overhaul)

Inputs: full HP retain (10 → 10), `initial_answer=True`, kill-value sums sized to `LEVEL_MAX_KILLS × ~30 pts/kill`, costs sized to a min-viable build.

| Level | kv_sum | active_time | cost | Score (new) | Cap | Used |
|---|---|---|---|---|---|---|
| 1★ | 1 500 | 55 s | 50 | 10.74 | 5 000 | 0.21% |
| 2★ | 3 000 | 110 s | 200 | 9.16 | 10 000 | 0.09% |
| 3★ | 6 000 | 165 s | 400 | 11.11 | 15 000 | 0.07% |
| 4★ | 15 000 | 220 s | 700 | 17.44 | 50 000 | 0.03% |
| 5★ | 30 000 | 275 s | 1 000 | 24.47 | 100 000 | 0.02% |

### Degenerate stress (cost=1 g, time=10 s, max-kv)

| Level | kv | Score | Cap | Used |
|---|---|---|---|---|
| 1★ | 1 500 | 165.81 | 5 000 | 3.3% |
| 3★ | 6 000 | 441.92 | 15 000 | 2.9% |
| 5★ | 100 000 | 3 230.88 | 100 000 | 3.2% |

### K required to hit each cap (algebraic)

`score = K^(1/√2) = K^0.7071` ⇒ K = cap^√2

| Level | Cap | K required |
|---|---|---|
| 1★ | 5 000 | ≈ 170 000 |
| 5★ | 100 000 | ≈ 11.8 M |

Realistic `K = max(s1, s2)` peaks in the hundreds. The caps would only be threatened by a kill-value sum on the order of tens of millions — impossible under the per-level kill bounds in `LEVEL_MAX_KILLS`. **Caps left unchanged.**

Audit script: [`scripts/audit_score_caps.py`](../../scripts/audit_score_caps.py) — reproducible from a clean checkout via `python scripts/audit_score_caps.py` (no venv activation needed; the script prepends `backend/` to `sys.path`).

---

## 2. Score parity (WASM ↔ Python ↔ TypeScript) — re-verified

Regenerated `shared/score_parity_fixtures.json` via `scripts/regenerate_score_fixtures.py`:
- Python fallback path: 5 fixtures rewritten — **byte-identical** to the committed file (`git diff` empty).
- WASM canonical path (via the frontend vitest `score-calculator.parity.test.ts`): **5/5 pass** against the same fixtures.

This confirms the three implementations agree on every value the parity matrix covers and the rewrite did not silently drift between commits.

---

## 3. Test suite snapshot

| Suite | Files | Tests | Result |
|---|---|---|---|
| Frontend vitest | 83 | 659 | **659 passed, 0 failed** (was 645 at branch fork) |
| Backend pytest | — | 410 | **405 passed, 5 skipped, 0 failed** |

Delta over the overhaul:
- Frontend: **+14 new tests** (Phase 7 talent crit/slow/burst/resonance/aoe + Phase 6 MAGIC/LIMIT, Phase 4 PetCombat, Phase 1 Matrix base damage, Phase 5 BuffSystem additive stacking).
- Backend: **+11 talent tests** in `test_talent.py` (+5 Phase 4 Q10: pet_hp removal + pet_range prereq/modifier; +6 Phase 7 Q14: max-level prereq enforcement, total cost 42 TP, wire payload, modifier surface). The Phase 4 Alembic migration runs cleanly under the test-DB fixture.

---

## 4. Replay baselines (manual capture — TODO before merge)

The same template as `balance-baseline-2026-05.md`. Pair each row with the matching pre-overhaul row to diff. **A playtester must fill these in by playing ~3 representative runs at each star** (the original 20 rows is the long-form goal; 3 per level is the merge-gate minimum).

Capture rules unchanged from the baseline doc:
- Use in-game replay capture so contested rows can be re-verified.
- Note tower build + talents allocated under `Notes`.
- `Pet count` is Calculus tower's spawn count at game end (Phase 4 Q12 dropped this sharply at high-coefficient builds; the diff vs baseline is the headline metric).
- `TP spent` is the total talent points consumed.

### 1★ (post-overhaul)

| # | Final score | Total gold | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

### 2★ (post-overhaul)

| # | Final score | Total gold | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

### 3★ (post-overhaul)

| # | Final score | Total gold | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

### 4★ (post-overhaul)

| # | Final score | Total gold | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

### 5★ (post-overhaul)

| # | Final score | Total gold | Pet count | TP spent | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

---

## 5. Playtest checklist (manual — TODO before merge)

From plan §"Phase 8 → Playtest checklist". Tick off as each is observed in-game:

- [ ] 1★ run feels easier than before (more accessible)
- [ ] 3★ run feels balanced (no single dominant tower)
- [ ] 5★ run is genuinely hard (Boss still scary even with the new 50%-reduction shield)
- [ ] MAGIC tower is built at least once in a 3★ run (validates Phase 6 Q7 re-skin)
- [ ] LIMIT tower is built at least once in a 4★+ run (validates Phase 6 Q8 burst design)
- [ ] Calculus 99-coefficient build spawns 6 pets, not 99 (validates Phase 4 Q12 exploit closure)
- [ ] A new player with all 55 achievement TP cannot fully complete the talent tree (validates Phase 7 Q14 headroom — tree budget = 69 + 42 = 111 TP)

---

## 6. Per-Q deliverable trace (grep-verified, not commit-message-trusted)

Per the "audits must grep/trace" rule. Each row is the file:line where the change is actually present in the working tree at `f8a24f9`.

| Q | Description | Verified at |
|---|---|---|
| Q1 | Score `K^(1/√denom)` exponent | `wasm/math_engine.c:163`, `backend/app/domain/scoring/score_calculator.py:109`, `frontend/src/domain/scoring/score-calculator.ts:68` |
| Q3 | Continuous K blend | `wasm/math_engine.c:154-155`, `backend/app/domain/scoring/score_calculator.py:94-96`, `frontend/src/domain/scoring/score-calculator.ts:50-52` |
| Q4+Q5 | Shield = 50% per-hit reduction | `frontend/src/engine/GameState.ts:56`, `frontend/src/systems/BuffSystem.ts:107-116`, `frontend/src/systems/EconomySystem.ts:31-37` |
| Q6 | BULWARK `towerDamageMult: 0.4` | `frontend/src/data/enemy-defs.ts:174` |
| Q7 | MAGIC AoE + slow | `frontend/src/entities/types.ts:166`, `frontend/src/systems/MovementSystem.ts:84`, `frontend/src/systems/MagicTowerSystem.ts:116-129` |
| Q8 | LIMIT charge-up burst (1.5×) | `frontend/src/systems/LimitTowerSystem.ts:13-17, 62-92` |
| Q9 | MATRIX base damage 1 | `frontend/src/data/tower-defs.ts:138` |
| Q10 | `pet_hp` → `pet_range` swap + Alembic | `backend/app/domain/talent/definitions.py:66`, `frontend/src/data/talent-defs.ts:50`, `backend/alembic/versions/cc3d4e5f6a8b_remove_calculus_pet_hp_allocations.py:27` |
| Q11 | Pet attack speed linear | `frontend/src/entities/PetFactory.ts:51` |
| Q12 | Pet count `log2(c+1)` | `frontend/src/entities/PetFactory.ts:35` |
| Q13 | 4 qualitative nodes at 3 TP/lv | `backend/app/domain/talent/definitions.py:38,47,52,56`, `frontend/src/data/talent-defs.ts:22,31,36,40` |
| Q14 | 7 advanced tier-2 talent nodes | `backend/app/domain/talent/definitions.py:72-92` (7 `_reg(...)` calls) + `backend/app/domain/talent/tree.py:117-124` (`prerequisite_max_levels` enforcement loop) + `frontend/src/data/talent-defs.ts:55-61` (mirror) |
| Q15 | Additive gold stacking | `frontend/src/engine/GameState.ts:61-62`, `frontend/src/systems/BuffSystem.ts:117-121` |
| Q16 | Wave bonus `10 + 20·star` | `shared/game-constants.json:37` |
| Q17 | MH 5★ 4th threshold 1000 | `frontend/src/data/monty-hall-defs.ts:31` (5★ 4th entry — was 1400) |
| Q18 | MH per-star reward gating | `frontend/src/data/monty-hall-defs.ts:46`, `frontend/src/systems/MontyHallSystem.ts:107` |
| Q19 | Unified `reward = round(kv × 1.5)` | `frontend/src/data/enemy-defs.ts:56,67,78,89,105,121,137,154,166,183` (10 reward fields) |

All 19 approved Q-items present in code at branch HEAD.

---

## 7. Aggregate observations (TODO — fill from §4 once playtested)

| Metric | 1★ | 2★ | 3★ | 4★ | 5★ |
|---|---|---|---|---|---|
| Median final score |  |  |  |  |  |
| Max final score |  |  |  |  |  |
| Median gold earned |  |  |  |  |  |
| Median pet count |  |  |  |  |  |
| Builds using Calculus (n/3) |  |  |  |  |  |
| Builds using MAGIC (n/3) |  |  |  |  |  |
| Builds using LIMIT (n/3) |  |  |  |  |  |

---

## 8. Rollback notes

If a critical issue surfaces post-merge, see plan §"Phase 8 → Rollback Plan". The pure-data phases (1, 4, 5, 7) revert cleanly. Phase 2 requires coordinated revert of C + Python + TS + fixtures; Phase 6 and Phase 3 touch live game state but the new fields default safely so currently-active sessions are unaffected.

Operator decision still pending from plan §"Open Questions": leaderboard treatment under the new formula (clear / `formula_version` tag / accept mixed). The score scale did not change category (still raw `K^exp`), so historical scores remain in the same numeric range — but a player's *typical* score will shift; communicate or tag accordingly.

---

*End of Phase 8 deliverable.*
