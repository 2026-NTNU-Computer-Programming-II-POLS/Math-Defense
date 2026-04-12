"""Smoke test: the Python side reads the same initial values as shared/game-constants.json.

Catches drift where a designer changes a value in the JSON but forgets the
backend is now loading from it — the comparison here fails loudly.
"""
import json
from pathlib import Path

from app import shared_constants
from app.domain.session.aggregate import GameSession
from app.domain.value_objects import Level


_SHARED_JSON = Path(__file__).resolve().parent.parent.parent / "shared" / "game-constants.json"


def _load_json() -> dict:
    with _SHARED_JSON.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_initial_hp_matches_shared_json():
    expected = _load_json()["player"]["initialHp"]
    assert shared_constants.INITIAL_HP == expected


def test_initial_gold_matches_shared_json():
    expected = _load_json()["player"]["initialGold"]
    assert shared_constants.INITIAL_GOLD == expected


def test_new_session_uses_shared_initial_values():
    session = GameSession.create("user-1", Level(1))
    assert session.hp == shared_constants.INITIAL_HP
    assert session.gold == shared_constants.INITIAL_GOLD
