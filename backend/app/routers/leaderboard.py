import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.leaderboard import LeaderboardEntry
from app.models.game_session import GameSession
from app.models.user import User
from app.schemas.leaderboard import ScoreSubmission, LeaderboardResponse, LeaderboardEntryOut
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    level: int | None = Query(None, ge=1, le=4),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base_q = db.query(LeaderboardEntry).join(User, LeaderboardEntry.user_id == User.id)
    if level is not None:
        base_q = base_q.filter(LeaderboardEntry.level == level)

    total = base_q.count()

    # Use DENSE_RANK() for correct tie handling + deterministic ordering
    rank_col = func.dense_rank().over(
        order_by=[LeaderboardEntry.score.desc(), LeaderboardEntry.created_at.asc()]
    ).label("rank")

    ranked_q = db.query(LeaderboardEntry, User.username, rank_col).join(
        User, LeaderboardEntry.user_id == User.id
    )
    if level is not None:
        ranked_q = ranked_q.filter(LeaderboardEntry.level == level)

    rows = (
        ranked_q
        .order_by(LeaderboardEntry.score.desc(), LeaderboardEntry.created_at.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    entries = [
        LeaderboardEntryOut(
            rank=rank,
            username=username,
            level=entry.level,
            score=entry.score,
            kills=entry.kills,
            waves_survived=entry.waves_survived,
            created_at=entry.created_at,
        )
        for entry, username, rank in rows
    ]

    return LeaderboardResponse(entries=entries, total=total)


@router.post("", status_code=201)
def submit_score(
    req: ScoreSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate session if provided
    if req.session_id:
        session = db.query(GameSession).filter(GameSession.id == req.session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session 不存在")
        if session.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="無權操作此 Session")
        if session.status != "completed":
            raise HTTPException(status_code=400, detail="Session 尚未完成")

    entry = LeaderboardEntry(
        user_id=current_user.id,
        level=req.level,
        score=req.score,
        kills=req.kills,
        waves_survived=req.waves_survived,
        session_id=req.session_id,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="此 Session 已提交過排行榜")
    db.refresh(entry)
    logger.info("Score submitted: user=%s level=%d score=%d", current_user.id, req.level, req.score)
    return {"id": entry.id, "score": entry.score}
