"""challenge router — Generative Challenge Mode CRUD (spec §23)."""
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.challenge.aggregate import Challenge
from app.domain.challenge.constraint_dsl import (
    ChallengeConstraints,
    MagicParamBounds,
)
from app.domain.challenge.tower_types import TowerType
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_challenge_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_role
from app.schemas.challenge import (
    ChallengeConstraintsIn,
    ChallengeConstraintsUpdate,
    ChallengeCreate,
    ChallengeOut,
    ChallengeRename,
)

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


def _to_domain_constraints(payload: ChallengeConstraintsIn) -> ChallengeConstraints:
    bounds = MagicParamBounds(
        a=payload.magic_param_bounds.a,
        b=payload.magic_param_bounds.b,
        c=payload.magic_param_bounds.c,
    )
    return ChallengeConstraints(
        allowed_towers=frozenset(TowerType(t) for t in payload.allowed_towers),
        wave_count=payload.wave_count,
        target_score=payload.target_score,
        magic_param_bounds=bounds,
        forbidden_mechanics=frozenset(payload.forbidden_mechanics),
    )


def _challenge_out(c: Challenge) -> ChallengeOut:
    return ChallengeOut(
        id=c.id,
        teacher_id=c.teacher_id,
        title=c.title,
        description=c.description,
        constraints=c.constraints.to_dict(),
        created_at=c.created_at,
        updated_at=c.updated_at,
        deep_link=f"/challenge/{c.id}",
    )


@router.post("", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_challenge(
    request: Request,
    req: ChallengeCreate,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    challenge = build_challenge_service(db).create(
        teacher_id=user.id,
        title=req.title,
        description=req.description,
        constraints=_to_domain_constraints(req.constraints),
    )
    return _challenge_out(challenge)


@router.get("", response_model=list[ChallengeOut])
@limiter.limit("60/minute")
def list_my_challenges(
    request: Request,
    mine: bool = Query(False, description="If true, list challenges authored by the requester."),
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    # v1 only supports the authored-by-requester view. Listing every public
    # challenge is out-of-scope (challenges are link-shared, not discovered).
    if not mine:
        return []
    return [
        _challenge_out(c)
        for c in build_challenge_service(db).list_for_teacher(user.id)
    ]


@router.get("/{challenge_id}", response_model=ChallengeOut)
@limiter.limit("60/minute")
def get_challenge(
    request: Request,
    challenge_id: str,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Read-by-id is intentionally open to any authenticated user: the
    # share model for challenges is "teacher pastes the deep link" so any
    # student handed the link must resolve it. The IDs are 128-bit UUIDs
    # so enumeration is not feasible (B-SEC-8). Do not add a teacher-only
    # gate here without first replacing the deep-link sharing flow.
    challenge = build_challenge_service(db).get(challenge_id)
    return _challenge_out(challenge)


@router.patch("/{challenge_id}", response_model=ChallengeOut)
@limiter.limit("20/minute")
def rename_challenge(
    request: Request,
    challenge_id: str,
    req: ChallengeRename,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    challenge = build_challenge_service(db).rename(
        challenge_id=challenge_id,
        requester_id=user.id,
        requester_role=user.role,
        title=req.title,
        description=req.description,
    )
    return _challenge_out(challenge)


@router.put("/{challenge_id}/constraints", response_model=ChallengeOut)
@limiter.limit("10/minute")
def update_constraints(
    request: Request,
    challenge_id: str,
    req: ChallengeConstraintsUpdate,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    challenge = build_challenge_service(db).replace_constraints(
        challenge_id=challenge_id,
        requester_id=user.id,
        requester_role=user.role,
        new_constraints=_to_domain_constraints(req.constraints),
    )
    return _challenge_out(challenge)


@router.delete("/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_challenge(
    request: Request,
    challenge_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    build_challenge_service(db).delete(
        challenge_id=challenge_id,
        requester_id=user.id,
        requester_role=user.role,
    )
