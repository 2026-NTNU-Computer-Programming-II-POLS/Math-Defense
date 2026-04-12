"""Domain constraints — single source of truth for value bounds.

Imported by Pydantic schemas (shape validation) and by value objects / the
GameSession aggregate (invariant enforcement) so that "level must be 1..4"
is encoded exactly once.
"""
from __future__ import annotations

LEVEL_MIN = 1
LEVEL_MAX = 4
LEVEL_RANGE = (LEVEL_MIN, LEVEL_MAX)

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
