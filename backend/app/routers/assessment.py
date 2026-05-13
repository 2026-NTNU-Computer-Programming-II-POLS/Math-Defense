"""Assessment router — Pedagogical_Backlog_Spec.md §9.

Exposes the per-class posterior read model that drives the teacher
dashboard. Two gates: ``require_role(TEACHER)`` blocks students and
admins at the FastAPI layer, and ``Class.verify_owner`` inside the
application service blocks one teacher from reading another teacher's
roster (mapped to 403 via ``NotClassOwnerError``).
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_assessment_service
from app.limiter import limiter
from app.middleware.auth import require_role
from app.schemas.assessment import (
    BetaSummaryOut,
    ClassPosteriorsOut,
    StudentCompetencyOut,
)

router = APIRouter(prefix="/api/assessment", tags=["assessment"])


@router.get(
    "/class/{class_id}/posteriors",
    response_model=ClassPosteriorsOut,
)
@limiter.limit("30/minute")
def class_posteriors(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    rows = build_assessment_service(db).get_class_posteriors(
        class_id=class_id, requester_id=user.id
    )
    return ClassPosteriorsOut(
        class_id=class_id,
        students=[
            StudentCompetencyOut(
                student_id=r.student_id,
                student_name=r.student_name,
                posteriors={
                    c.value: BetaSummaryOut(
                        alpha=s.alpha,
                        beta=s.beta,
                        mean=s.mean,
                        ci_low=s.ci_low,
                        ci_high=s.ci_high,
                    )
                    for c, s in r.posteriors.items()
                },
                lowest_competency=r.lowest_competency.value,
                suggestion=r.suggestion,
            )
            for r in rows
        ],
    )
