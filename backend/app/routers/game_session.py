"""game_session router — thin Controller; handles HTTP semantics only"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.game_session import SessionCreate, SessionUpdate, SessionEnd, SessionOut
from app.middleware.auth import get_current_user
from app.models.user import User
from app.application.session_service import SessionApplicationService, SessionNotFoundError, SessionStaleError
from app.domain.session.aggregate import SessionNotActiveError
from app.infrastructure.persistence.session_repository import SqlAlchemySessionRepository
from app.infrastructure.persistence.leaderboard_repository import SqlAlchemyLeaderboardRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from app.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _get_service(db: Session) -> SessionApplicationService:
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def _to_response(session) -> dict:
    """Map domain aggregate to a SessionOut-compatible dict"""
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
@limiter.limit("30/minute")
def create_session(
    request: Request,
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


@router.get("/active", response_model=SessionOut | None)
@limiter.limit("60/minute")
def get_active_session(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lets the frontend adopt/clean an orphaned active session after a reload
    # or a rapid LEVEL_START race where the session id was lost client-side.
    service = _get_service(db)
    session = service.get_active_for_user(current_user.id)
    if not session:
        return None
    return _to_response(session)


@router.patch("/{session_id}", response_model=SessionOut)
@limiter.limit("120/minute")
def update_session(
    request: Request,
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
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionStaleError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except SessionNotActiveError:
        raise HTTPException(status_code=409, detail="Session is no longer active")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _to_response(session)


@router.post("/{session_id}/abandon", response_model=SessionOut)
@limiter.limit("30/minute")
def abandon_session(
    request: Request,
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = _get_service(db)
    try:
        session = service.abandon_session(session_id, current_user.id)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_response(session)


@router.post("/{session_id}/end", response_model=SessionOut)
@limiter.limit("30/minute")
def end_session(
    request: Request,
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
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionStaleError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except SessionNotActiveError:
        raise HTTPException(status_code=409, detail="Session already ended, cannot resubmit")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to end session: session=%s", session_id)
        raise HTTPException(status_code=500, detail="Failed to end session") from e
    return _to_response(session)
