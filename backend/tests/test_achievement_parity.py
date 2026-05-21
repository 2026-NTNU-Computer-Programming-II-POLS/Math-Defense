"""Assert backend and frontend achievement catalogues are identical.

Mirrors test_avatar_parity.py. The frontend keeps its own copy of the
achievement definitions in achievement-defs.ts (for offline rendering and for
components that branch on the local constant); it must not drift from the
backend single source of truth in app/domain/achievement/definitions.py.

See docs/Audit/BUGS_2026-05-21.md — "2 Backend Achievements Missing from
Frontend": explore_reach_star_2 / explore_reach_star_4 were defined on the
backend but absent from the frontend, so unlocked achievements rendered blank.
"""
import re
from pathlib import Path

import pytest

_FRONTEND_DEFS = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend" / "src" / "data" / "achievement-defs.ts"
)


def _parse_frontend_defs() -> dict[str, dict]:
    """Extract the ACHIEVEMENT_DEFS object literal into {id: fields}."""
    source = _FRONTEND_DEFS.read_text(encoding="utf-8")
    block = re.search(
        r"export const ACHIEVEMENT_DEFS[^=]*=\s*\{(.*)\}", source, re.DOTALL
    )
    if not block:
        raise AssertionError("ACHIEVEMENT_DEFS not found in achievement-defs.ts")
    defs: dict[str, dict] = {}
    # Each entry is a brace-delimited object literal with no nested braces.
    for obj in re.findall(r"\{([^{}]*)\}", block.group(1)):
        fields = dict(re.findall(r"(\w+):\s*'([^']*)'", obj))
        tp = re.search(r"talentPoints:\s*(\d+)", obj)
        if "id" not in fields or tp is None:
            continue
        defs[fields["id"]] = {
            "name": fields["name"],
            "description": fields["description"],
            "category": fields["category"],
            "talent_points": int(tp.group(1)),
        }
    return defs


def test_achievement_defs_match_backend():
    if not _FRONTEND_DEFS.exists():
        pytest.skip("Frontend source not available in this environment")
    from app.domain.achievement.definitions import ACHIEVEMENT_DEFS

    frontend = _parse_frontend_defs()
    backend = {
        d.id: {
            "name": d.name,
            "description": d.description,
            "category": d.category,
            "talent_points": d.talent_points,
        }
        for d in ACHIEVEMENT_DEFS.values()
    }

    backend_only = set(backend) - set(frontend)
    frontend_only = set(frontend) - set(backend)
    assert not backend_only and not frontend_only, (
        f"Achievement id mismatch — backend only: {backend_only}, "
        f"frontend only: {frontend_only}"
    )

    mismatches = {
        aid: {"backend": backend[aid], "frontend": frontend[aid]}
        for aid in backend
        if backend[aid] != frontend[aid]
    }
    assert not mismatches, f"Achievement field mismatch: {mismatches}"
