"""Domain constraints — single source of truth for value bounds.

Imported by Pydantic schemas (shape validation) and by value objects / the
GameSession aggregate (invariant enforcement) so that "level must be 1..5"
is encoded exactly once.
"""
from __future__ import annotations

STAR_MIN = 1
STAR_MAX = 5
STAR_RANGE = (STAR_MIN, STAR_MAX)

LEVEL_MIN = STAR_MIN
LEVEL_MAX = STAR_MAX
LEVEL_RANGE = STAR_RANGE

SCORE_MIN = 0
SCORE_MAX = 9_999_999
SCORE_RANGE = (SCORE_MIN, SCORE_MAX)

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
MAX_SCORE_DELTA = 50_000

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
