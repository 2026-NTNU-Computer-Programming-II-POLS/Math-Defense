"""CSRF double-submit cookie middleware.

Defence-in-depth on top of the SameSite=Lax auth cookie. Issues a
non-HttpOnly `csrf_token` cookie that the browser JS reads and echoes back
in an `X-CSRF-Token` header on every state-changing request; a match is
required when the auth cookie is present.

Disabled by default (see Settings.csrf_enabled) so it is opt-in per
environment — the existing auth cookie already carries SameSite=Lax, which
blocks the classic cross-site POST CSRF path on modern browsers.
"""
from __future__ import annotations

import secrets

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.middleware.auth import AUTH_COOKIE_NAME

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
_UNSAFE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
# Endpoints that can't have a CSRF cookie yet (login/register mint the auth
# cookie; logout is best-effort). Cross-site forging these is not a CSRF
# concern because there is no prior authenticated session to abuse.
_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/logout"}


class CsrfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if (
            settings.csrf_enabled
            and request.method.upper() in _UNSAFE_METHODS
            and request.url.path not in _EXEMPT_PATHS
            and request.cookies.get(AUTH_COOKIE_NAME) is not None
        ):
            cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
            header_token = request.headers.get(CSRF_HEADER_NAME)
            if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
                return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})

        response = await call_next(request)

        # Mint a token if the client doesn't have one yet — the SPA reads it
        # from document.cookie on the next mutating request.
        if settings.csrf_enabled and request.cookies.get(CSRF_COOKIE_NAME) is None:
            response.set_cookie(
                key=CSRF_COOKIE_NAME,
                value=secrets.token_urlsafe(32),
                httponly=False,  # JS must read this one
                secure=settings.cookie_secure,
                samesite="lax",
                path="/",
            )
        return response
