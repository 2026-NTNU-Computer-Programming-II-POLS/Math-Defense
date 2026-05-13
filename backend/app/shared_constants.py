"""Mirror of game-constants.json on the Python side.

Single source of truth lives at ``shared/game-constants.json`` for parity with
the frontend (which imports it through a Vite alias). The backend resolves the
file via, in order:

1. ``GAME_CONSTANTS_PATH`` env var — production deploys point this at the
   packaged copy and never depend on the repo layout.
2. A copy bundled inside the ``app`` package (``app/data/game-constants.json``)
   — picked up via ``importlib.resources`` so wheels/zipapps work.
3. The repo-root ``shared/game-constants.json`` — fallback for source
   checkouts and tests, where the parity test guarantees it stays in sync.

Removing the hard ``backend/../../shared/`` path traversal addresses B-ARCH-17:
the runtime no longer reaches outside the package by default.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Any


_REPO_ROOT_FALLBACK = (
    Path(__file__).resolve().parent.parent.parent / "shared" / "game-constants.json"
)


def _resolve_constants_path() -> Path | None:
    override = os.environ.get("GAME_CONSTANTS_PATH")
    if override:
        return Path(override)
    return None


@lru_cache(maxsize=1)
def load_game_constants() -> dict[str, Any]:
    override = _resolve_constants_path()
    if override is not None:
        with override.open("r", encoding="utf-8") as f:
            return json.load(f)

    # Try a packaged copy first so installed wheels do not need the repo
    # layout. The file is intentionally optional — source checkouts are
    # served by the repo-root fallback below.
    try:
        ref = resources.files("app").joinpath("data/game-constants.json")
        if ref.is_file():
            with ref.open("r", encoding="utf-8") as f:
                return json.load(f)
    except (FileNotFoundError, ModuleNotFoundError, AttributeError):
        pass

    with _REPO_ROOT_FALLBACK.open("r", encoding="utf-8") as f:
        return json.load(f)


GAME_CONSTANTS: dict[str, Any] = load_game_constants()

# Initial player resources — authoritative for GameSession aggregate defaults.
INITIAL_HP: int = GAME_CONSTANTS["player"]["initialHp"]
INITIAL_GOLD: int = GAME_CONSTANTS["player"]["initialGold"]
