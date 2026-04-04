from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.leaderboard import LeaderboardEntry
from app.models.user import User
from app.schemas.leaderboard import ScoreSubmission, LeaderboardResponse, LeaderboardEntryOut
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    level: int | None = Query(None, ge=1, le=4),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(LeaderboardEntry, User.username).join(User, LeaderboardEntry.user_id == User.id)
    if level is not None:
        q = q.filter(LeaderboardEntry.level == level)

    total = q.count()
    rows = q.order_by(LeaderboardEntry.score.desc()).offset((page - 1) * per_page).limit(per_page).all()

    entries = [
        LeaderboardEntryOut(
            rank=(page - 1) * per_page + i + 1,
            username=username,
            level=entry.level,
            score=entry.score,
            kills=entry.kills,
            waves_survived=entry.waves_survived,
            created_at=entry.created_at,
        )
        for i, (entry, username) in enumerate(rows)
    ]

    return LeaderboardResponse(entries=entries, total=total)


@router.post("", status_code=201)
def submit_score(
    req: ScoreSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = LeaderboardEntry(
        user_id=current_user.id,
        level=req.level,
        score=req.score,
        kills=req.kills,
        waves_survived=req.waves_survived,
        session_id=req.session_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "score": entry.score}
