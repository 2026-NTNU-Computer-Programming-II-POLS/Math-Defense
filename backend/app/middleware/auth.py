from typing import Callable

from fastapi import Depends, Request, WebSocket
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import DomainError, InvalidTokenError, PermissionDeniedError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_auth_service

AUTH_COOKIE_NAME = "access_token"

bearer_scheme = HTTPBearer(auto_error=False)

_REQUEST_CACHE_ATTR = "_auth_current_user"


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    cached = getattr(request.state, _REQUEST_CACHE_ATTR, None)
    if cached is not None:
        return cached

    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token and credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        raise InvalidTokenError("Not authenticated")

    user = build_auth_service(db).authenticate_token(token)
    setattr(request.state, _REQUEST_CACHE_ATTR, user)
    return user


def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising when unauthenticated."""
    try:
        return get_current_user(request, credentials, db)
    except DomainError:
        return None


async def authenticate_ws(websocket: WebSocket, db: Session) -> User | None:
    """Authenticate a WebSocket handshake via origin check + access-token cookie.

    CSWSH defence: browsers always send Origin on WS upgrades; a missing or
    unlisted origin is rejected with close code 4403. Token auth failure closes
    with 4401. Returns None (socket already closed) on any failure so callers
    can ``return`` immediately after checking.
    """
    from app.config import settings

    origin = websocket.headers.get("origin")
    if not origin or origin not in settings.cors_origins:
        await websocket.close(code=4403, reason="forbidden origin")
        return None

    token = websocket.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        await websocket.close(code=4401, reason="unauthenticated")
        return None

    try:
        return build_auth_service(db).authenticate_token(token)
    except Exception:
        await websocket.close(code=4401, reason="unauthenticated")
        return None


def require_role(*roles: Role) -> Callable[..., User]:
    """FastAPI dependency that enforces role-based access.

    Usage:
        @router.post("/classes")
        def create_class(user: User = Depends(require_role(Role.TEACHER, Role.ADMIN))):
            pass
    """
    allowed = set(roles)

    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise PermissionDeniedError(
                f"This action requires one of: {', '.join(r.value for r in allowed)}"
            )
        return user

    return _check
