"""Phase 8 anti-cheat audit — confirms LEVEL_MAX_SCORES caps still hold under
the post-overhaul score formula (Phase 2 Q1 sqrt exponent + Q3 continuous K).

The formula is gentler than the pre-overhaul `1/denom` cliff, so a perfect-play
run scores slightly HIGHER under the new path. If the new max-realistic score
at any star level were to exceed `LEVEL_MAX_SCORES`, the cap would need raising
before merge; this script makes that check reproducible.

Run from anywhere — appends `backend/` to sys.path so the import works without
activating the venv:

    python scripts/audit_score_caps.py

Outputs a per-level table of (realistic, degenerate-stress, K-needed-to-hit-cap)
columns. Reviewer's job: confirm every "Used%" row is well under 100%.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "backend"))

from app.domain.scoring.score_calculator import recompute_total_score  # noqa: E402

# Pulled from backend/app/domain/constraints.py at audit time.
CAPS = {1: 5_000, 2: 10_000, 3: 15_000, 4: 50_000, 5: 100_000}


def main() -> int:
    print("=== Realistic per-level max (perfect retain, initial_answer=True) ===")
    print(f"{'L':<3}{'kv_sum':>9}{'time':>7}{'cost':>6}{'score':>11}{'cap':>10}{'used%':>9}")
    # Inputs: kill-value sums sized to LEVEL_MAX_KILLS x ~30 pts/kill, costs
    # sized to a min-viable build, prep time generous.
    scenarios = [
        (1,  1500,  60.0,  5.0,   50),
        (2,  3000, 120.0, 10.0,  200),
        (3,  6000, 180.0, 15.0,  400),
        (4, 15000, 240.0, 20.0,  700),
        (5, 30000, 300.0, 25.0, 1000),
    ]
    for L, kv, t, prep, c in scenarios:
        s = recompute_total_score(kv, t, [prep], c, 10, 10, True)
        print(f"{L:<3}{kv:>9}{t:>7.0f}{c:>6}{s:>11.2f}{CAPS[L]:>10}{(s/CAPS[L]*100):>8.2f}%")

    print()
    print("=== Degenerate stress: cost=1g, time=10s, max kill_value ===")
    for L, kv_max in [(1, 1500), (3, 6000), (5, 100_000)]:
        s = recompute_total_score(kv_max, 10.0, [0.0], 1, 10, 10, True)
        print(f"L{L}: kv={kv_max} t=10s cost=1 -> {s:.2f} (cap={CAPS[L]})")

    print()
    print("=== K-doubling: what K is required to hit each cap? ===")
    # score = K^(1/sqrt(2)) -> K = cap^sqrt(2). Reality check: K = max(s1, s2)
    # peaks in the hundreds, so caps would only be threatened by tens-of-millions
    # of kill-value, impossible under LEVEL_MAX_KILLS.
    for L, cap in CAPS.items():
        K_needed = cap ** math.sqrt(2.0)
        print(f"L{L}: cap={cap:>7} requires K={K_needed:>13.0f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
