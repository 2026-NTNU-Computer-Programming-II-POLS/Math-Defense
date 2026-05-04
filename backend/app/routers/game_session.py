"""game_session router — thin Controller; HTTP semantics only.

Error translation lives in the global DomainError / ValueError handlers in
main.py, so per-endpoint try/except walls are unnecessary here.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.application.mappers import session_to_out
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_session_service
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.game_session import SessionCreate, SessionEnd, SessionOut, SessionUpdate

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=201)
@limiter.limit("30/minute")
def create_session(
    request: Request,
    req: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = build_session_service(db).create_session(current_user.id, req.star_rating, initial_answer=req.initial_answer, path_config=req.path_config)
    return session_to_out(session)


@router.get("/active", response_model=SessionOut | None)
@limiter.limit("60/minute")
def get_active_session(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lets the frontend adopt/clean an orphaned active session after a reload
    # or a rapid LEVEL_START race where the session id was lost client-side.
    session = build_session_service(db).get_active_for_user(current_user.id)
    return session_to_out(session) if session else None


@router.patch("/{session_id}", response_model=SessionOut)
@limiter.limit("120/minute")
def update_session(
    request: Request,
    session_id: UUID,
    req: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = build_session_service(db).update_session(
        str(session_id),
        current_user.id,
        current_wave=req.current_wave,
        gold=req.gold,
        hp=req.hp,
        score=req.score,
        kill_value=req.kill_value,
        cost_total=req.cost_total,
    )
    return session_to_out(session)


@router.post("/{session_id}/abandon", response_model=SessionOut)
@limiter.limit("30/minute")
def abandon_session(
    request: Request,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = build_session_service(db).abandon_session(str(session_id), current_user.id)
    return session_to_out(session)


@router.post("/{session_id}/end", response_model=SessionOut)
@limiter.limit("30/minute")
def end_session(
    request: Request,
    session_id: UUID,
    req: SessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = build_session_service(db).end_session(
        str(session_id),
        current_user.id,
        score=req.score,
        kills=req.kills,
        waves_survived=req.waves_survived,
        kill_value=req.kill_value,
        cost_total=req.cost_total,
        time_total=req.time_total,
        health_origin=req.health_origin,
        health_final=req.health_final,
        time_exclude_prepare=req.time_exclude_prepare,
        total_score=req.total_score,
    )
    return session_to_out(result.session, result.newly_unlocked)
