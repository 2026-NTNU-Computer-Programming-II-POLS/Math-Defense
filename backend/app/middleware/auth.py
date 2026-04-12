from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.utils.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer()

_REQUEST_CACHE_ATTR = "_auth_current_user"


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Request-scoped cache: FastAPI's Depends caching already dedupes calls
    # within one request for most routes, but sub-dependencies that resolve
    # the user manually (middleware, background task hand-offs, websockets)
    # bypass that cache. Stashing the lookup on request.state makes the
    # per-request DB hit a true singleton regardless of entry point.
    cached = getattr(request.state, _REQUEST_CACHE_ATTR, None)
    if cached is not None:
        return cached

    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 無效或已過期")

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 格式錯誤")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="使用者不存在")

    setattr(request.state, _REQUEST_CACHE_ATTR, user)
    return user
