import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.utils.security import hash_password, verify_password, create_access_token
from app.middleware.auth import get_current_user
from app.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        logger.warning("Registration failed: username '%s' already taken", req.username)
        raise HTTPException(status_code=409, detail="用戶名已被使用")

    user = User(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("User registered: id=%s username=%s", user.id, user.username)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user_id=user.id, username=user.username)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        logger.warning("Login failed: username='%s'", req.username)
        raise HTTPException(status_code=401, detail="用戶名或密碼錯誤")

    logger.info("User logged in: id=%s username=%s", user.id, user.username)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user_id=user.id, username=user.username)


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username}
