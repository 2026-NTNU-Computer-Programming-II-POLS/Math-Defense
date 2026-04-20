import uuid
from datetime import datetime, timedelta, UTC
from typing import Any
import bcrypt
import jwt
from app.config import settings

_BCRYPT_MAX_BYTES = 72


def _encode_or_raise(password: str) -> bytes:
    # bcrypt silently truncates inputs >72 bytes, which would otherwise make
    # `correctpass + <anything>` verify as correctpass. Schema validators
    # already reject over-length passwords at the HTTP edge, but non-HTTP
    # callers (tests, scripts) can still reach these helpers; raise here so
    # truncation is never silently applied regardless of entry point.
    encoded = password.encode("utf-8")
    if len(encoded) > _BCRYPT_MAX_BYTES:
        raise ValueError(f"password exceeds bcrypt's {_BCRYPT_MAX_BYTES}-byte limit")
    return encoded


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_encode_or_raise(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        encoded = _encode_or_raise(plain)
    except ValueError:
        return False
    return bcrypt.checkpw(encoded, hashed.encode("utf-8"))


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": uuid.uuid4().hex,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    })
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    # Rollout note: tokens issued before `iat`/`iss`/`aud` became required
    # decode to None here, forcing a one-time re-login. Acceptable because
    # access_token_expire_minutes is short (30m) — the affected window closes
    # on its own within one TTL of deploying this change.
    try:
        # Pin header alg explicitly: even though `algorithms=[...]` already
        # restricts verification, an un-asserted header leaves the door open
        # if the allow-list is ever broadened (classic alg-confusion re-entry).
        header = jwt.get_unverified_header(token)
        if header.get("alg") != settings.algorithm:
            return None
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "sub", "jti", "iss", "aud"]},
        )
    except jwt.InvalidTokenError:
        return None
