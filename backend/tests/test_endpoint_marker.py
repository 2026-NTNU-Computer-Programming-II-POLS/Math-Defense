"""Endpoint marker (P*) preferences — backend defense tests.

Covers the four layers behind the PUT /api/auth/profile/endpoint-marker route:
1. Pydantic schema validation (early 422)
2. User aggregate invariants (canonical validation)
3. Route integration (auth + persistence round-trip via GET /me)
4. FE/BE allowlist parity (mirror of test_avatar_parity)
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.domain.user.constraints import (
    ALLOWED_ENDPOINT_HIT_FX_STYLES,
    ALLOWED_ENDPOINT_MARKER_STYLES,
    ENDPOINT_MARKER_DATAURL_MAX_LENGTH,
)
from app.schemas.auth import EndpointMarkerUpdateRequest


# ── Fixtures ────────────────────────────────────────────────────────────────

# Minimal PNG bytes the aggregate accepts: 8-byte signature + IHDR chunk
# declaring small dimensions (the validator parses IHDR to reject decompression
# bombs). The chunk-length field (4 bytes, value 13) and CRC are dummy; the
# parser only inspects the chunk-type magic and the width/height ints.
def _png_bytes(width: int = 1, height: int = 1, trailing: bytes = b'') -> bytes:
    return (
        b'\x89PNG\r\n\x1a\n'          # signature
        + b'\x00\x00\x00\r'           # chunk length (13)
        + b'IHDR'                      # chunk type
        + width.to_bytes(4, 'big')    # width
        + height.to_bytes(4, 'big')   # height
        + b'\x08\x06\x00\x00\x00'      # bit depth, colour type, compression, filter, interlace
        + b'\x00\x00\x00\x00'         # dummy CRC
        + trailing
    )


_VALID_PNG_BYTES = _png_bytes(1, 1)
# JPEG bytes: just the SOI + first APP0 marker is enough since the backend
# never parses JPEG dimensions (the size cap is the only defense).
_VALID_JPEG_BYTES = b'\xff\xd8\xff\xe0' + b'filler-payload-bytes'


def _png_dataurl(payload: bytes | None = None) -> str:
    body = payload if payload is not None else _VALID_PNG_BYTES
    return "data:image/png;base64," + base64.b64encode(body).decode("ascii")


def _jpeg_dataurl(payload: bytes | None = None) -> str:
    body = payload if payload is not None else _VALID_JPEG_BYTES
    return "data:image/jpeg;base64," + base64.b64encode(body).decode("ascii")


def _make_user() -> User:
    return User(
        id="test-user-id",
        email="marker@test.local",
        player_name="marker",
        role=Role.STUDENT,
        password_hash="x" * 60,
    )


# ── Pydantic schema layer ────────────────────────────────────────────────────

class TestSchemaValidation:
    def test_accepts_all_three_styles(self):
        for style in ('star', 'gorilla', 'custom'):
            req = EndpointMarkerUpdateRequest(style=style, custom_dataurl=None, hit_fx=None)
            assert req.style == style

    def test_rejects_unknown_style(self):
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest(style='monkey', custom_dataurl=None, hit_fx=None)

    def test_accepts_all_hit_fx(self):
        for fx in ('random', 'fragments', 'crying', 'angry'):
            req = EndpointMarkerUpdateRequest(style=None, custom_dataurl=None, hit_fx=fx)
            assert req.hit_fx == fx

    def test_rejects_unknown_hit_fx(self):
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest(style=None, custom_dataurl=None, hit_fx='confetti')

    def test_rejects_extra_field(self):
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest.model_validate({
                'style': 'star', 'custom_dataurl': None, 'hit_fx': None,
                'malicious': 'payload',
            })

    def test_rejects_dataurl_with_wrong_prefix(self):
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest(
                style='custom',
                custom_dataurl='data:image/gif;base64,R0lGODlhAQABAAAAACw=',
                hit_fx=None,
            )

    def test_rejects_dataurl_with_no_prefix(self):
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest(
                style='custom',
                custom_dataurl='iVBORw0KGgo=',  # raw base64, no header
                hit_fx=None,
            )

    def test_rejects_oversize_dataurl(self):
        # Build a string just over the cap with a valid prefix so the length
        # check fires before the prefix check.
        prefix = 'data:image/png;base64,'
        oversize = prefix + 'A' * (ENDPOINT_MARKER_DATAURL_MAX_LENGTH - len(prefix) + 1)
        with pytest.raises(ValidationError):
            EndpointMarkerUpdateRequest(
                style='custom', custom_dataurl=oversize, hit_fx=None,
            )


# ── Aggregate (canonical) layer ─────────────────────────────────────────────

class TestAggregateValidation:
    def test_assigns_all_three_fields(self):
        user = _make_user()
        user.update_endpoint_marker('custom', _png_dataurl(), 'angry')
        assert user.endpoint_marker_style == 'custom'
        assert user.endpoint_marker_custom_dataurl.startswith('data:image/png;base64,')
        assert user.endpoint_hit_fx == 'angry'

    def test_none_clears_each_field_independently(self):
        user = _make_user()
        user.update_endpoint_marker('custom', _png_dataurl(), 'angry')
        user.update_endpoint_marker(None, None, None)
        assert user.endpoint_marker_style is None
        assert user.endpoint_marker_custom_dataurl is None
        assert user.endpoint_hit_fx is None

    def test_accepts_valid_jpeg(self):
        user = _make_user()
        user.update_endpoint_marker('custom', _jpeg_dataurl(), None)
        assert user.endpoint_marker_custom_dataurl.startswith('data:image/jpeg;base64,')

    def test_custom_style_with_no_image_is_allowed(self):
        # Player picks 'custom' but hasn't uploaded yet — must persist the
        # style without forcing them to upload first.
        user = _make_user()
        user.update_endpoint_marker('custom', None, None)
        assert user.endpoint_marker_style == 'custom'
        assert user.endpoint_marker_custom_dataurl is None

    def test_dataurl_without_custom_style_rejected(self):
        # Refuses the contradiction outright instead of silently clearing
        # the image — the aggregate would rather complain than guess.
        user = _make_user()
        with pytest.raises(ValueError, match='custom_dataurl is only allowed'):
            user.update_endpoint_marker('star', _png_dataurl(), None)

    def test_invalid_base64_rejected(self):
        user = _make_user()
        # Prefix is valid but the trailing payload contains a non-base64 char.
        broken = 'data:image/png;base64,!!!not_base64!!!'
        with pytest.raises(ValueError, match='base64'):
            user.update_endpoint_marker('custom', broken, None)

    def test_magic_byte_mismatch_rejected(self):
        # A PNG prefix wrapping JPEG bytes — a polyglot the FE would never
        # produce but a malicious client might try.
        user = _make_user()
        spoof = 'data:image/png;base64,' + base64.b64encode(_VALID_JPEG_BYTES).decode('ascii')
        with pytest.raises(ValueError, match='do not match'):
            user.update_endpoint_marker('custom', spoof, None)

    def test_empty_base64_payload_rejected(self):
        user = _make_user()
        with pytest.raises(ValueError, match='empty'):
            user.update_endpoint_marker('custom', 'data:image/png;base64,', None)

    def test_unknown_style_rejected(self):
        user = _make_user()
        with pytest.raises(ValueError, match='endpoint_marker_style'):
            user.update_endpoint_marker('monkey', None, None)

    def test_unknown_hit_fx_rejected(self):
        user = _make_user()
        with pytest.raises(ValueError, match='endpoint_hit_fx'):
            user.update_endpoint_marker(None, None, 'sparkle')

    def test_png_dimension_bomb_rejected(self):
        # Defends against a small payload that declares huge dimensions in
        # IHDR — the FE on another device would then try to decompress an
        # enormous bitmap and crash. The IHDR check rejects this.
        user = _make_user()
        bomb = _png_dataurl(_png_bytes(999_999, 999_999))
        with pytest.raises(ValueError, match='dimensions'):
            user.update_endpoint_marker('custom', bomb, None)

    def test_png_zero_dimension_rejected(self):
        user = _make_user()
        bad = _png_dataurl(_png_bytes(0, 1))
        with pytest.raises(ValueError, match='dimensions'):
            user.update_endpoint_marker('custom', bad, None)

    def test_png_truncated_before_ihdr_rejected(self):
        # Payload with the PNG signature but cut off before the IHDR chunk —
        # the FE would never produce this; a hand-crafted bypass attempt.
        user = _make_user()
        truncated = b'\x89PNG\r\n\x1a\n' + b'\x00\x00'
        bad = 'data:image/png;base64,' + base64.b64encode(truncated).decode('ascii')
        with pytest.raises(ValueError, match='IHDR'):
            user.update_endpoint_marker('custom', bad, None)

    def test_png_at_max_dimension_accepted(self):
        # Boundary case: exactly the cap should still be accepted.
        from app.domain.user.constraints import ENDPOINT_MARKER_MAX_DIMENSION
        user = _make_user()
        ok = _png_dataurl(_png_bytes(ENDPOINT_MARKER_MAX_DIMENSION, ENDPOINT_MARKER_MAX_DIMENSION))
        user.update_endpoint_marker('custom', ok, None)
        assert user.endpoint_marker_custom_dataurl == ok


# ── Route integration ───────────────────────────────────────────────────────

_REG_PASSWORD = "xQ7!aPm2#vKz9"


def _login(client, email: str):
    client.post("/api/auth/register", json={
        "email": email, "password": _REG_PASSWORD, "player_name": email.split("@")[0],
    })
    login = client.post(
        "/api/auth/login",
        json={"email": email, "password": _REG_PASSWORD},
    )
    return login.cookies.get("access_token")


class TestRouteIntegration:
    def test_round_trip_persists_via_me(self, client):
        token = _login(client, "marker-rt@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"style": "gorilla", "custom_dataurl": None, "hit_fx": "crying"}
        res = client.put("/api/auth/profile/endpoint-marker", json=payload, headers=headers)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["endpoint_marker_style"] == "gorilla"
        assert body["endpoint_hit_fx"] == "crying"
        assert body["endpoint_marker_custom_dataurl"] is None

        me = client.get("/api/auth/me", headers=headers).json()
        assert me["endpoint_marker_style"] == "gorilla"
        assert me["endpoint_hit_fx"] == "crying"

    def test_custom_image_round_trip(self, client):
        token = _login(client, "marker-img@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        dataurl = _png_dataurl()
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={"style": "custom", "custom_dataurl": dataurl, "hit_fx": "random"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["endpoint_marker_custom_dataurl"] == dataurl

    def test_invalid_style_returns_422(self, client):
        token = _login(client, "marker-422a@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={"style": "monkey", "custom_dataurl": None, "hit_fx": None},
            headers=headers,
        )
        assert res.status_code == 422

    def test_dataurl_with_wrong_prefix_returns_422(self, client):
        token = _login(client, "marker-422b@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={
                "style": "custom",
                "custom_dataurl": "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
                "hit_fx": None,
            },
            headers=headers,
        )
        assert res.status_code == 422

    def test_dataurl_with_bad_magic_returns_422(self, client):
        token = _login(client, "marker-magic@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        # A PNG-declared dataURL containing JPEG bytes — passes Pydantic
        # (correct prefix + valid base64) but trips the aggregate's magic-byte
        # check. DomainValueError is mapped to 422 by http_status_map.py.
        spoof = 'data:image/png;base64,' + base64.b64encode(_VALID_JPEG_BYTES).decode('ascii')
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={"style": "custom", "custom_dataurl": spoof, "hit_fx": None},
            headers=headers,
        )
        assert res.status_code == 422, res.text

    def test_png_dimension_bomb_returns_422(self, client):
        token = _login(client, "marker-bomb@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        bomb = _png_dataurl(_png_bytes(999_999, 999_999))
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={"style": "custom", "custom_dataurl": bomb, "hit_fx": None},
            headers=headers,
        )
        assert res.status_code == 422, res.text

    def test_unauthenticated_returns_401(self, client):
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={"style": "star", "custom_dataurl": None, "hit_fx": None},
        )
        assert res.status_code == 401

    def test_extra_field_returns_422(self, client):
        token = _login(client, "marker-extra@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/endpoint-marker",
            json={
                "style": "star", "custom_dataurl": None, "hit_fx": None,
                "malicious": "payload",
            },
            headers=headers,
        )
        assert res.status_code == 422


# ── FE/BE parity (mirror of test_avatar_parity) ─────────────────────────────

_FRONTEND_UI_STORE = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend" / "src" / "stores" / "uiStore.ts"
)


def _parse_frontend_union(source: str, type_name: str) -> frozenset[str]:
    pat = re.compile(rf"export type {type_name}\s*=\s*([^\n]+)")
    m = pat.search(source)
    if not m:
        raise AssertionError(f"{type_name} not found in uiStore.ts")
    return frozenset(re.findall(r"'([^']+)'", m.group(1)))


def test_endpoint_marker_style_parity():
    if not _FRONTEND_UI_STORE.exists():
        pytest.skip("Frontend source not available in this environment")
    source = _FRONTEND_UI_STORE.read_text(encoding="utf-8")
    frontend = _parse_frontend_union(source, "EndpointMarkerStyle")
    assert frontend == ALLOWED_ENDPOINT_MARKER_STYLES, (
        f"Marker style mismatch — FE: {frontend}, BE: {ALLOWED_ENDPOINT_MARKER_STYLES}"
    )


def test_endpoint_hit_fx_parity():
    if not _FRONTEND_UI_STORE.exists():
        pytest.skip("Frontend source not available in this environment")
    source = _FRONTEND_UI_STORE.read_text(encoding="utf-8")
    frontend = _parse_frontend_union(source, "EndpointHitFxStyle")
    assert frontend == ALLOWED_ENDPOINT_HIT_FX_STYLES, (
        f"Hit FX mismatch — FE: {frontend}, BE: {ALLOWED_ENDPOINT_HIT_FX_STYLES}"
    )
