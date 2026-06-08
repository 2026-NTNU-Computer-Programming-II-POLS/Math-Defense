"""Domain constraints — single source of truth for value bounds.

Imported by Pydantic schemas (shape validation) and by value objects / the
GameSession aggregate (invariant enforcement) so that "level must be 1..5"
is encoded exactly once.
"""
from __future__ import annotations

import math

STAR_MIN = 1
STAR_MAX = 5
STAR_RANGE = (STAR_MIN, STAR_MAX)

LEVEL_MIN = STAR_MIN
LEVEL_MAX = STAR_MAX
LEVEL_RANGE = STAR_RANGE

SCORE_MIN = 0
SCORE_MAX = 9_999_999
SCORE_RANGE = (SCORE_MIN, SCORE_MAX)

# V3 floating-point total_score cap — matches the `le` bound in SessionEnd.total_score schema.
TOTAL_SCORE_MAX = 1_000_000.0

KILLS_MIN = 0
KILLS_MAX = 9_999
KILLS_RANGE = (KILLS_MIN, KILLS_MAX)

WAVES_MIN = 0
WAVES_MAX = 999
WAVES_RANGE = (WAVES_MIN, WAVES_MAX)

# HP and GOLD upper bounds are defense-in-depth caps on client-reported
# progress updates, not the initial-value spawns (those live in shared_constants).
HP_MIN = 0
HP_MAX = 100
HP_RANGE = (HP_MIN, HP_MAX)

GOLD_MIN = 0
GOLD_MAX = 99_999
GOLD_RANGE = (GOLD_MIN, GOLD_MAX)

# Per-wave anti-cheat ceilings.
MAX_WAVE = 30

# ── Per-level anti-cheat caps ──
# Based on enemy counts × 10 pts/kill (with split-slime children), multiplied
# by a generous safety margin so legitimate play never trips these.

LEVEL_MAX_SCORES: dict[int, int] = {
    1: 5_000,
    2: 10_000,
    3: 15_000,
    4: 50_000,
    5: 100_000,
}

LEVEL_MAX_KILLS: dict[int, int] = {
    1: 50,
    2: 100,
    3: 200,
    4: 300,
    5: 500,
}

LEVEL_MAX_WAVES: dict[int, int] = {
    1: 3,
    2: 4,
    3: 5,
    4: 5,
    5: 6,
}


# Per-level single-update score delta cap (was a flat 50_000 — far looser than
# any legitimate per-wave score).
# Sized as ``ceil(level_max_score / level_max_waves) × 2``: twice the average
# per-wave allocation so a wave that concentrates the level's score budget
# (e.g. a boss wave) still passes, but a single update jumping the whole
# level cap is rejected. Sync cadence is once per WAVE_END so this is the
# correct granularity (see frontend/src/services/sessionLifecycleService.ts).
def max_score_delta_for(level: int) -> int:
    """Per-level cap on a single ``score`` increase in update_progress / complete.

    Falls back to 50_000 (the pre-tightening flat value) for unknown levels so
    callers outside the canonical 1..5 range still see an upper bound.
    """
    level_cap = LEVEL_MAX_SCORES.get(int(level))
    wave_cap = LEVEL_MAX_WAVES.get(int(level))
    if level_cap is None or not wave_cap:
        return 50_000
    return math.ceil(level_cap / wave_cap) * 2


# Backwards-compatible export for tests / callers that imported the flat value.
# Equals the loosest legitimate cap across the 1..5 range so a test asserting
# "delta above MAX_SCORE_DELTA is rejected" still passes on every level.
MAX_SCORE_DELTA = max(max_score_delta_for(lv) for lv in LEVEL_MAX_SCORES)
