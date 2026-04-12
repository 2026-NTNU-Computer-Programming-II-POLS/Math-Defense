"""Mirror of shared/game-constants.json on the Python side.

The frontend imports the JSON directly through a Vite alias. This module loads
the same file at process start so backend validators and domain aggregates use
the same canonical values — change the JSON once and both sides stay in sync.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

# backend/app/shared_constants.py -> backend/app -> backend -> repo root -> shared/
_CONSTANTS_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "game-constants.json"


@lru_cache(maxsize=1)
def load_game_constants() -> dict[str, Any]:
    with _CONSTANTS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


GAME_CONSTANTS: dict[str, Any] = load_game_constants()

# Initial player resources — authoritative for GameSession aggregate defaults.
INITIAL_HP: int = GAME_CONSTANTS["player"]["initialHp"]
INITIAL_GOLD: int = GAME_CONSTANTS["player"]["initialGold"]
