"""Assert backend and frontend avatar whitelists are identical — D-4."""
import re
from pathlib import Path

import pytest

_FRONTEND_VIEW = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend" / "src" / "views" / "ProfileView.vue"
)


def _parse_frontend_avatars() -> frozenset[str]:
    source = _FRONTEND_VIEW.read_text(encoding="utf-8")
    match = re.search(r"const PRESET_AVATARS\s*=\s*\[(.*?)\]", source, re.DOTALL)
    if not match:
        raise AssertionError("PRESET_AVATARS not found in ProfileView.vue")
    return frozenset(re.findall(r"'([^']+)'", match.group(1)))


def test_avatar_whitelist_matches_frontend():
    if not _FRONTEND_VIEW.exists():
        pytest.skip("Frontend source not available in this environment")
    from app.schemas.auth import _ALLOWED_AVATAR_URLS  # noqa: PLC2701
    frontend = _parse_frontend_avatars()
    backend_only = _ALLOWED_AVATAR_URLS - frontend
    frontend_only = frontend - _ALLOWED_AVATAR_URLS
    assert not backend_only and not frontend_only, (
        f"Avatar mismatch — backend only: {backend_only}, frontend only: {frontend_only}"
    )
