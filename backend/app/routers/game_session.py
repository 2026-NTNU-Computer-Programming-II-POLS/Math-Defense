import logging
from datetime import datetime, timedelta, UTC
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.game_session import GameSession
from app.models.leaderboard import LeaderboardEntry
from app.schemas.game_session import SessionCreate, SessionUpdate, SessionEnd, SessionOut
from app.middleware.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=201)
def create_session(
    req: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Mark stale sessions (active for >2 hours) as abandoned
    stale_cutoff = datetime.now(UTC) - timedelta(hours=2)
    db.query(GameSession).filter(
        GameSession.user_id == current_user.id,
        GameSession.status == "active",
        GameSession.started_at < stale_cutoff,
    ).update({"status": "abandoned", "ended_at": datetime.now(UTC)})
    db.flush()

    # Limit to one active session per user — abandon any existing active session
    existing_active = db.query(GameSession).filter(
        GameSession.user_id == current_user.id,
        GameSession.status == "active",
    ).with_for_update().first()
    if existing_active:
        existing_active.status = "abandoned"
        existing_active.ended_at = datetime.now(UTC)

    session = GameSession(user_id=current_user.id, level=req.level)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: str,
    req: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_session(session_id, current_user.id, db)
    if session.status != "active":
        raise HTTPException(status_code=409, detail="Session 已結束")
    if req.current_wave is not None:
        session.current_wave = req.current_wave
    if req.gold is not None:
        session.gold = req.gold
    if req.hp is not None:
        session.hp = req.hp
    if req.score is not None:
        session.score = req.score
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: str,
    req: SessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_session(session_id, current_user.id, db)
    if session.status != "active":
        raise HTTPException(status_code=409, detail="Session 已結束，無法重複提交")

    try:
        session.status = "completed"
        session.score = req.score
        session.ended_at = datetime.now(UTC)
        db.flush()

        # 自動提交排行榜（若已存在則跳過）
        existing = db.query(LeaderboardEntry).filter(
            LeaderboardEntry.session_id == session.id
        ).first()
        if not existing:
            entry = LeaderboardEntry(
                user_id=current_user.id,
                level=session.level,
                score=req.score,
                kills=req.kills,
                waves_survived=req.waves_survived,
                session_id=session.id,
            )
            db.add(entry)

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to end session: session=%s user=%s", session_id, current_user.id)
        raise HTTPException(status_code=500, detail="結束 Session 失敗，請重試")

    db.refresh(session)
    logger.info("Session ended: session=%s user=%s score=%d", session.id, current_user.id, req.score)
    return session


def _get_session(session_id: str, user_id: str, db: Session) -> GameSession:
    session = db.query(GameSession).filter(
        GameSession.id == session_id,
        GameSession.user_id == user_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session 不存在")
    return session
