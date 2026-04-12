import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, AuthMeResponse
from app.utils.security import hash_password, verify_password, create_access_token
from app.middleware.auth import get_current_user
from app.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _anon(username: str) -> str:
    """Stable, short fingerprint of a username so logs stay correlatable without leaking it."""
    return hashlib.sha256(username.encode("utf-8")).hexdigest()[:10]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        logger.warning("Registration failed: username_hash=%s", _anon(req.username))
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("User registered: id=%s", user.id)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, username=user.username)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        logger.warning("Login failed: username_hash=%s", _anon(req.username))
        raise HTTPException(status_code=401, detail="Invalid username or password")

    logger.info("User logged in: id=%s", user.id)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, username=user.username)


@router.get("/me", response_model=AuthMeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return AuthMeResponse(
        id=current_user.id,
        username=current_user.username,
        created_at=current_user.created_at,
    )
