"""Study router — Empirical Validity Probe (Pedagogical_Backlog_Spec.md §27).

Endpoints:
  * ``POST /api/study/enroll``       — idempotent enrollment, returns group.
  * ``POST /api/study/probe``        — submit a 10-item probe form.
  * ``POST /api/study/affect``       — submit an affect Likert survey.
  * ``GET  /api/study/export``       — admin-only CSV (one row per participant).
"""
from __future__ import annotations

import csv
import io
import re

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import DomainValueError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_study_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_role
from app.schemas.study import (
    AffectSubmitRequest,
    EnrollResponse,
    ProbeSubmitRequest,
    ProbeSubmitResponse,
)

router = APIRouter(prefix="/api/study", tags=["study"])

# Keep this in sync with is_valid_study_id; the router pattern is wider
# than the path-safety constraint we need on the export filename.
_STUDY_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@router.post("/enroll", response_model=EnrollResponse)
@limiter.limit("10/minute")
def enroll(
    request: Request,
    study_id: str = Query(..., min_length=1, max_length=64),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _STUDY_ID_PATTERN.match(study_id):
        raise DomainValueError(
            "study_id must be 1..64 chars of [A-Za-z0-9_-]"
        )
    group = build_study_service(db).enroll(user.id, study_id)
    return EnrollResponse(group=group.value)


@router.post("/probe", response_model=ProbeSubmitResponse)
@limiter.limit("10/minute")
def submit_probe(
    request: Request,
    req: ProbeSubmitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = build_study_service(db).submit_probe(
        user_id=user.id,
        study_id=req.study_id,
        form=req.form,
        responses=[r.model_dump() for r in req.responses],
    )
    return ProbeSubmitResponse(score=score)


@router.post("/affect", status_code=204)
@limiter.limit("10/minute")
def submit_affect(
    request: Request,
    req: AffectSubmitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_study_service(db).submit_affect(
        user_id=user.id,
        study_id=req.study_id,
        phase=req.phase,
        anxiety_items=req.anxiety_items,
        motivation_items=req.motivation_items,
    )


_CSV_INJECTION_TRIGGERS = ('=', '+', '-', '@', '\t', '\r')


def _csv_safe(val: str) -> str:
    """Prefix val with ' if it starts with a spreadsheet formula-trigger character."""
    if val and val[0] in _CSV_INJECTION_TRIGGERS:
        return "'" + val
    return val


# CSV export header — must match Pedagogical_Backlog_Spec.md §27.2 exactly so
# downstream R/Python analysis scripts can rely on column ordering.
_EXPORT_HEADER = [
    "user_id",
    "group",
    "pre_score",
    "post_score",
    "delay_score",
    "dosage_seconds",
    "anxiety_pre",
    "anxiety_post",
]


@router.get("/export")
@limiter.limit("10/minute")
def export_csv(
    request: Request,
    study_id: str = Query(..., min_length=1, max_length=64),
    user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    if not _STUDY_ID_PATTERN.match(study_id):
        raise DomainValueError(
            "study_id must be 1..64 chars of [A-Za-z0-9_-]"
        )
    rows = build_study_service(db).export_csv_rows(user, study_id)

    buf = io.StringIO()
    # ``csv.writer`` handles the empty-cell encoding for None values when we
    # convert to "" explicitly — csv quotes only when needed, which is what
    # downstream tools expect.
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(_EXPORT_HEADER)
    for r in rows:
        writer.writerow([
            # Conditionally prefix string cells: if a value starts with a
            # spreadsheet formula-trigger character (=, +, -, @, tab, CR) prefix
            # it with ' to prevent formula injection when opened in Excel /
            # LibreOffice. UUID and enum values never start with these chars, so
            # downstream R/Python consumers receive unmodified values today; the
            # guard fires automatically if either field ever carries user text.
            _csv_safe(str(r.user_id)),
            _csv_safe(str(r.group)),
            "" if r.pre_score is None else r.pre_score,
            "" if r.post_score is None else r.post_score,
            "" if r.delay_score is None else r.delay_score,
            r.dosage_seconds,
            "" if r.anxiety_pre is None else f"{r.anxiety_pre:.4f}",
            "" if r.anxiety_post is None else f"{r.anxiety_post:.4f}",
        ])

    body = buf.getvalue().encode("utf-8")
    filename = f"study_{study_id}.csv"
    return StreamingResponse(
        io.BytesIO(body),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Disable caching: an export is a snapshot, and admin tooling
            # may re-run the request to compare evolving state.
            "Cache-Control": "no-store",
        },
    )
