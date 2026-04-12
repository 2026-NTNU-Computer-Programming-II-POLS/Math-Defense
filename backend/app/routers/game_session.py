"""game_session router — 瘦 Controller，只做 HTTP 語義轉譯"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.game_session import SessionCreate, SessionUpdate, SessionEnd, SessionOut
from app.middleware.auth import get_current_user
from app.models.user import User
from app.application.session_service import SessionApplicationService, SessionNotFoundError
from app.domain.session.aggregate import SessionNotActiveError
from app.infrastructure.persistence.session_repository import SqlAlchemySessionRepository
from app.infrastructure.persistence.leaderboard_repository import SqlAlchemyLeaderboardRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _get_service(db: Session) -> SessionApplicationService:
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def _to_response(session) -> dict:
    """Domain Aggregate → SessionOut 相容的 dict"""
    return {
        "id": session.id,
        "level": int(session.level),
        "status": session.status.value,
        "current_wave": session.current_wave,
        "gold": session.gold,
        "hp": session.hp,
        "score": session.score,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }


@router.post("", response_model=SessionOut, status_code=201)
def create_session(
    req: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = _get_service(db)
    try:
        session = service.create_session(current_user.id, req.level)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _to_response(session)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: str,
    req: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = _get_service(db)
    try:
        session = service.update_session(
            session_id,
            current_user.id,
            current_wave=req.current_wave,
            gold=req.gold,
            hp=req.hp,
            score=req.score,
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session 不存在")
    except SessionNotActiveError:
        raise HTTPException(status_code=409, detail="Session 已結束")
    return _to_response(session)


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: str,
    req: SessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = _get_service(db)
    try:
        session = service.end_session(
            session_id,
            current_user.id,
            score=req.score,
            kills=req.kills,
            waves_survived=req.waves_survived,
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session 不存在")
    except SessionNotActiveError:
        raise HTTPException(status_code=409, detail="Session 已結束，無法重複提交")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Failed to end session: session=%s", session_id)
        raise HTTPException(status_code=500, detail="結束 Session 失敗，請重試")
    return _to_response(session)
