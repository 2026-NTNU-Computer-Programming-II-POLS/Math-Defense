"""TowerType enum — backend mirror of frontend/src/data/constants.ts.

Backend never simulates tower placement, but the Challenge constraint surface
(spec §23.3) needs a typed whitelist for `allowed_towers`. Keep these literals
in lockstep with the frontend constants module.
"""
from __future__ import annotations

import enum


class TowerType(str, enum.Enum):
    MAGIC = "magic"
    RADAR_A = "radarA"
    RADAR_B = "radarB"
    RADAR_C = "radarC"
    MATRIX = "matrix"
    LIMIT = "limit"
    CALCULUS = "calculus"


# Closed whitelist for `forbidden_mechanics` (spec §23.3). Strings outside this
# set are rejected at the schema layer. Order is informational only.
ALLOWED_FORBIDDEN_MECHANICS: frozenset[str] = frozenset({
    "calculus_pet",
    "monty_hall",
    "chain_rule",
    "buffs",
    "spells",
})
