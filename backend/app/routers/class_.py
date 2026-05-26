import csv
import io
import logging

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_class_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_role
from app.schemas.class_ import (
    AddCoTeacherRequest,
    AddStudentRequest,
    BulkAddStudentsRequest,
    BulkAddStudentsResult,
    ClassGroupOut,
    ClassLeaderboardEntry,
    ClassOut,
    ClassOutStudent,
    ClassReflectionOut,
    ClassReportRow,
    CoTeacherOut,
    CreateClassRequest,
    CreateGroupRequest,
    GroupMemberOut,
    JoinClassRequest,
    JoinQrOut,
    MembershipOut,
    MoveStudentRequest,
    PendingInviteOut,
    TransferOwnershipRequest,
    UpdateClassRequest,
    UpdateGroupRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/classes", tags=["classes"])


# ── Class CRUD ────────────────────────────────────────────────────────────────


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_class(
    request: Request,
    req: CreateClassRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).create_class(
        name=req.name,
        teacher_id=user.id,
        description=req.description,
        subject=req.subject,
        school_year=req.school_year,
        capacity=req.capacity,
        color=req.color,
        icon=req.icon,
    )
    logger.info("Class created: id=%s by user=%s", cls_.id, user.id)
    return _class_out(cls_)


@router.get("", response_model=list[ClassOut | ClassOutStudent])
@limiter.limit("30/minute")
def list_classes(
    request: Request,
    include_archived: bool = Query(default=True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    if user.is_admin:
        # Admin list is paginated through GET /api/admin/classes; this
        # endpoint returns the first 1000 for backwards compatibility.
        return [_class_out(c) for c in svc.list_all_classes()]
    if user.is_teacher:
        return [
            _class_out(c)
            for c in svc.list_classes_for_teacher(user.id, include_archived=include_archived)
        ]
    pairs = svc.list_classes_for_student_with_teachers(user.id)
    if not include_archived:
        pairs = [(c, t) for c, t in pairs if not c.is_archived]
    return [_class_out_student(c, t) for c, t in pairs]


@router.post("/join", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def join_class(
    request: Request,
    req: JoinClassRequest,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    membership = build_class_service(db).join_by_code(code=req.code, student_id=user.id, student_role=user.role)
    return _membership_out(membership, user)


@router.post("/claim-invites", response_model=list[MembershipOut])
@limiter.limit("10/minute")
def claim_invites(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually attach any pending invites that match this user's email.

    Auto-claim also runs on /register, but this endpoint covers existing
    users who get invited after they have already signed up.
    """
    memberships = build_class_service(db).claim_pending_invites(
        user_id=user.id, email=user.email, role=user.role,
    )
    return [_membership_out(m, user) for m in memberships]


@router.get("/{class_id}", response_model=ClassOut | ClassOutStudent)
@limiter.limit("30/minute")
def get_class(
    request: Request,
    class_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    if user.role == Role.STUDENT:
        cls_, teacher = svc.get_class_for_student_with_teacher(class_id, user.id)
        return _class_out_student(cls_, teacher)
    cls_ = svc.get_class_for_owner(class_id, user.id, user.role)
    return _class_out(cls_)


@router.put("/{class_id}", response_model=ClassOut)
@limiter.limit("10/minute")
def rename_class(
    request: Request,
    class_id: str,
    req: UpdateClassRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).update_class_metadata(
        class_id=class_id,
        requester_id=user.id,
        requester_role=user.role,
        name=req.name,
        description=req.description if req.description is not None else ...,
        subject=req.subject if req.subject is not None else ...,
        school_year=req.school_year if req.school_year is not None else ...,
        capacity=req.capacity if req.capacity is not None else ...,
        color=req.color if req.color is not None else ...,
        icon=req.icon if req.icon is not None else ...,
    )
    logger.info("Class updated: id=%s by user=%s", class_id, user.id)
    return _class_out(cls_)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_class(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).delete_class(class_id, user.id, user.role)
    logger.info("Class deleted: id=%s by user=%s", class_id, user.id)


# ── Archive / transfer ────────────────────────────────────────────────────────


@router.post("/{class_id}/archive", response_model=ClassOut)
@limiter.limit("10/minute")
def archive_class(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).archive_class(class_id, user.id, user.role)
    return _class_out(cls_)


@router.post("/{class_id}/unarchive", response_model=ClassOut)
@limiter.limit("10/minute")
def unarchive_class(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).unarchive_class(class_id, user.id, user.role)
    return _class_out(cls_)


@router.post("/{class_id}/transfer", response_model=ClassOut)
@limiter.limit("5/minute")
def transfer_class_ownership(
    request: Request,
    class_id: str,
    req: TransferOwnershipRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).transfer_ownership(
        class_id=class_id,
        new_teacher_id=req.new_teacher_id,
        requester_id=user.id,
        requester_role=user.role,
    )
    return _class_out(cls_)


# ── Students ──────────────────────────────────────────────────────────────────


@router.post("/{class_id}/students", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def add_student(
    request: Request,
    class_id: str,
    req: AddStudentRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    membership, student = build_class_service(db).add_student_with_user(
        class_id=class_id,
        student_email=req.email,
        requester_id=user.id,
        requester_role=user.role,
    )
    return _membership_out(membership, student)


@router.post(
    "/{class_id}/students/bulk",
    response_model=BulkAddStudentsResult,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("5/minute")
def bulk_add_students(
    request: Request,
    class_id: str,
    req: BulkAddStudentsRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    outcome = build_class_service(db).bulk_add_students(
        class_id=class_id,
        emails=req.emails,
        requester_id=user.id,
        requester_role=user.role,
    )
    return BulkAddStudentsResult(
        added=[_membership_out(m, u) for m, u in outcome.added],
        invited=[_invite_out(i) for i in outcome.invited],
        skipped=outcome.skipped,
    )


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def remove_student(
    request: Request,
    class_id: str,
    student_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).remove_student(
        class_id=class_id,
        student_id=student_id,
        requester_id=user.id,
        requester_role=user.role,
    )


@router.post(
    "/{class_id}/students/{student_id}/move",
    response_model=MembershipOut,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("10/minute")
def move_student(
    request: Request,
    class_id: str,
    student_id: str,
    req: MoveStudentRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    membership, student = svc.move_student_with_user(
        source_class_id=class_id,
        target_class_id=req.target_class_id,
        student_id=student_id,
        requester_id=user.id,
        requester_role=user.role,
    )
    return _membership_out(membership, student)


@router.get("/{class_id}/students", response_model=list[MembershipOut])
@limiter.limit("30/minute")
def list_students(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    pairs = build_class_service(db).list_students_with_users(class_id, user.id, user.role)
    return [_membership_out(m, u) for m, u in pairs]


@router.get("/{class_id}/reflections", response_model=list[ClassReflectionOut])
@limiter.limit("30/minute")
def list_class_reflections(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    views = build_class_service(db).list_class_reflections(
        class_id, user.id, user.role,
    )
    return [
        ClassReflectionOut(
            session_id=v.session_id,
            student_id=v.student_id,
            student_name=v.student_name,
            star_rating=v.star_rating,
            score=v.score,
            reflection_text=v.reflection_text,
            ended_at=v.ended_at,
        )
        for v in views
    ]


@router.post("/{class_id}/regenerate-code", response_model=dict)
@limiter.limit("5/minute")
def regenerate_code(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    new_code = build_class_service(db).regenerate_join_code(
        class_id=class_id,
        requester_id=user.id,
        requester_role=user.role,
    )
    return {"join_code": new_code}


@router.get("/{class_id}/qr", response_model=JoinQrOut)
@limiter.limit("30/minute")
def get_join_qr(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    cls_ = svc.get_class_for_owner(class_id, user.id, user.role)
    base = settings.frontend_url.rstrip("/")
    return JoinQrOut(code=cls_.join_code, join_url=f"{base}/classes/join?code={cls_.join_code}")


# ── Co-teachers ───────────────────────────────────────────────────────────────


@router.get("/{class_id}/co-teachers", response_model=list[CoTeacherOut])
@limiter.limit("30/minute")
def list_co_teachers(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    pairs = build_class_service(db).list_co_teachers(class_id, user.id, user.role)
    return [_co_teacher_out(co, u) for co, u in pairs]


@router.post("/{class_id}/co-teachers", response_model=CoTeacherOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def add_co_teacher(
    request: Request,
    class_id: str,
    req: AddCoTeacherRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    co, teacher = build_class_service(db).add_co_teacher(
        class_id=class_id,
        teacher_email=req.email,
        requester_id=user.id,
        requester_role=user.role,
    )
    return _co_teacher_out(co, teacher)


@router.delete("/{class_id}/co-teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def remove_co_teacher(
    request: Request,
    class_id: str,
    teacher_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).remove_co_teacher(
        class_id=class_id,
        teacher_id=teacher_id,
        requester_id=user.id,
        requester_role=user.role,
    )


# ── Pending invites ───────────────────────────────────────────────────────────


@router.get("/{class_id}/invites", response_model=list[PendingInviteOut])
@limiter.limit("30/minute")
def list_invites(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    invites = build_class_service(db).list_pending_invites(class_id, user.id, user.role)
    return [_invite_out(i) for i in invites]


@router.delete("/{class_id}/invites/{email}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def revoke_invite(
    request: Request,
    class_id: str,
    email: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).revoke_invite(class_id, email, user.id, user.role)


# ── Groups ────────────────────────────────────────────────────────────────────


@router.get("/{class_id}/groups", response_model=list[ClassGroupOut])
@limiter.limit("30/minute")
def list_groups(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    groups, counts = build_class_service(db).list_groups(class_id, user.id, user.role)
    return [_group_out(g, counts.get(g.id, 0)) for g in groups]


@router.post("/{class_id}/groups", response_model=ClassGroupOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def create_group(
    request: Request,
    class_id: str,
    req: CreateGroupRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    group = build_class_service(db).create_group(
        class_id=class_id, name=req.name, color=req.color,
        requester_id=user.id, requester_role=user.role,
    )
    return _group_out(group, 0)


@router.put("/{class_id}/groups/{group_id}", response_model=ClassGroupOut)
@limiter.limit("20/minute")
def update_group(
    request: Request,
    class_id: str,
    group_id: str,
    req: UpdateGroupRequest,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    group, count = build_class_service(db).update_group(
        class_id=class_id,
        group_id=group_id,
        requester_id=user.id,
        requester_role=user.role,
        name=req.name,
        color=req.color if req.color is not None else ...,
    )
    return _group_out(group, count)


@router.delete("/{class_id}/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
def delete_group(
    request: Request,
    class_id: str,
    group_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).delete_group(class_id, group_id, user.id, user.role)


@router.get("/{class_id}/groups/{group_id}/members", response_model=list[GroupMemberOut])
@limiter.limit("30/minute")
def list_group_members(
    request: Request,
    class_id: str,
    group_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    pairs = build_class_service(db).list_group_members(class_id, group_id, user.id, user.role)
    return [
        GroupMemberOut(
            group_id=m.group_id,
            student_id=m.student_id,
            player_name=u.player_name if u else "",
            email=u.email if u else "",
        )
        for m, u in pairs
    ]


@router.post(
    "/{class_id}/groups/{group_id}/members/{student_id}",
    response_model=GroupMemberOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
def add_group_member(
    request: Request,
    class_id: str,
    group_id: str,
    student_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    member, student = svc.add_group_member_with_user(
        class_id, group_id, student_id, user.id, user.role,
    )
    return GroupMemberOut(
        group_id=member.group_id,
        student_id=member.student_id,
        player_name=student.player_name if student else "",
        email=student.email if student else "",
    )


@router.delete(
    "/{class_id}/groups/{group_id}/members/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute")
def remove_group_member(
    request: Request,
    class_id: str,
    group_id: str,
    student_id: str,
    user: User = Depends(require_role(Role.TEACHER)),
    db: Session = Depends(get_db),
):
    build_class_service(db).remove_group_member(
        class_id, group_id, student_id, user.id, user.role,
    )


# ── Leaderboard + report ──────────────────────────────────────────────────────


@router.get("/{class_id}/leaderboard", response_model=list[ClassLeaderboardEntry])
@limiter.limit("30/minute")
def class_leaderboard(
    request: Request,
    class_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = build_class_service(db).class_leaderboard(class_id, user.id, user.role)
    return [
        ClassLeaderboardEntry(
            student_id=r.student_id,
            player_name=r.player_name,
            sessions_played=r.sessions_played,
            average_stars=r.average_stars,
            total_score=r.total_score,
            last_played_at=r.last_played_at,
        )
        for r in rows
    ]


@router.get("/{class_id}/report", response_model=list[ClassReportRow])
@limiter.limit("10/minute")
def class_report(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    rows = build_class_service(db).class_report(class_id, user.id, user.role)
    return [
        ClassReportRow(
            student_id=r.student_id,
            player_name=r.player_name,
            email=r.email,
            joined_at=r.joined_at,
            sessions_played=r.sessions_played,
            average_stars=r.average_stars,
            total_score=r.total_score,
            last_played_at=r.last_played_at,
            reflections_count=r.reflections_count,
        )
        for r in rows
    ]


@router.get("/{class_id}/report.csv")
@limiter.limit("10/minute")
def class_report_csv(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    rows = build_class_service(db).class_report(class_id, user.id, user.role)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "student_id", "player_name", "email", "joined_at",
        "sessions_played", "average_stars", "total_score",
        "last_played_at", "reflections_count",
    ])
    for r in rows:
        writer.writerow([
            r.student_id, r.player_name, r.email,
            r.joined_at.isoformat() if r.joined_at else "",
            r.sessions_played, f"{r.average_stars:.2f}", r.total_score,
            r.last_played_at.isoformat() if r.last_played_at else "",
            r.reflections_count,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="class-{class_id}-report.csv"'},
    )


# ── Mappers ───────────────────────────────────────────────────────────────────


def _class_out(cls_) -> ClassOut:
    return ClassOut(
        id=cls_.id,
        name=cls_.name,
        teacher_id=cls_.teacher_id,
        join_code=cls_.join_code,
        created_at=cls_.created_at,
        description=cls_.description,
        subject=cls_.subject,
        school_year=cls_.school_year,
        capacity=cls_.capacity,
        color=cls_.color,
        icon=cls_.icon,
        archived_at=cls_.archived_at,
    )


def _class_out_student(cls_, teacher: User | None = None) -> ClassOutStudent:
    return ClassOutStudent(
        id=cls_.id,
        name=cls_.name,
        teacher_id=cls_.teacher_id,
        teacher_player_name=teacher.player_name if teacher else None,
        created_at=cls_.created_at,
        description=cls_.description,
        subject=cls_.subject,
        school_year=cls_.school_year,
        color=cls_.color,
        icon=cls_.icon,
        archived_at=cls_.archived_at,
    )


def _membership_out(m, user: User | None = None) -> MembershipOut:
    return MembershipOut(
        id=m.id,
        class_id=m.class_id,
        student_id=m.student_id,
        joined_at=m.joined_at,
        player_name=user.player_name if user else "",
        email=user.email if user else "",
    )


def _co_teacher_out(co, user: User | None = None) -> CoTeacherOut:
    return CoTeacherOut(
        id=co.id,
        class_id=co.class_id,
        teacher_id=co.teacher_id,
        player_name=user.player_name if user else "",
        email=user.email if user else "",
        added_at=co.added_at,
    )


def _invite_out(inv) -> PendingInviteOut:
    return PendingInviteOut(
        id=inv.id,
        class_id=inv.class_id,
        email=inv.email,
        invited_at=inv.invited_at,
    )


def _group_out(g, member_count: int) -> ClassGroupOut:
    return ClassGroupOut(
        id=g.id,
        class_id=g.class_id,
        name=g.name,
        color=g.color,
        created_at=g.created_at,
        member_count=member_count,
    )
