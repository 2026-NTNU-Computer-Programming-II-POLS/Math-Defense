"""SQLAlchemy implementation of GameSessionRepository"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from sqlalchemy import func, text
from sqlalchemy.orm import Session as DbSession

from app.domain.session.aggregate import GameSession
from app.domain.leaderboard.view import SessionHistoryEntry
from app.domain.session.repository import CumulativeStats
from app.domain.value_objects import SessionStatus, Level
from app.models.game_session import GameSession as GameSessionModel


class SqlAlchemySessionRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session_id,
            GameSessionModel.user_id == user_id,
        ).first()
        return self._to_domain(row) if row else None

    def find_by_id_for_update(self, session_id: str, user_id: str) -> GameSession | None:
        # Row-level lock prevents the TOCTOU race between the duplicate-submission
        # check and the leaderboard insert. On SQLite with_for_update is a no-op,
        # but the DB-level unique constraint on leaderboard.session_id is the
        # fallback safety net (callers should catch ConstraintViolationError).
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session_id,
            GameSessionModel.user_id == user_id,
        ).with_for_update().first()
        return self._to_domain(row) if row else None

    def find_active_by_user(self, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
        ).first()
        return self._to_domain(row) if row else None

    def find_active_by_user_for_update(self, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
        ).with_for_update().first()
        return self._to_domain(row) if row else None

    def acquire_user_create_lock(self, user_id: str) -> None:
        # B-BUG-12: serialise concurrent create_session for the same user.
        # Without this, concurrent inserts can all pass the find_active_by_user
        # check (no row to lock) and then race to the unique partial index,
        # exhausting the depth-1 retry → RuntimeError("unreachable"). A
        # transaction-scoped advisory lock keyed on hashtext(user_id) makes
        # the create path strictly serial per user; auto-released at commit.
        # No-op on non-PG dialects (legacy tests) — the existing retry covers
        # the much narrower SQLite race.
        if self._db.get_bind().dialect.name == "postgresql":
            self._db.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:uid))"),
                {"uid": user_id},
            )

    def find_stale_sessions(self, user_id: str) -> list[GameSession]:
        cutoff = datetime.now(UTC) - timedelta(hours=GameSession.stale_cutoff_hours())
        rows = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
            GameSessionModel.started_at < cutoff,
        ).all()
        return [self._to_domain(r) for r in rows]

    def save(self, session: GameSession) -> None:
        # Normalise tz on the way out so the column never receives a naive
        # datetime, mirroring _ensure_utc() on load. Keeps the entire round-trip
        # UTC-aware even if an upstream caller handed us a naive datetime.
        started_at = _ensure_utc(session.started_at)
        ended_at = _ensure_utc(session.ended_at)

        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session.id
        ).first()
        if row:
            # started_at is an aggregate invariant: it is set once at creation
            # and must never change. Surface future setters that break this
            # instead of silently dropping the mutation on update.
            if _ensure_utc(row.started_at) != started_at:
                raise StartedAtMutationError(
                    f"started_at is immutable on GameSession (session={session.id})"
                )
            row.status = session.status.value
            row.current_wave = session.current_wave
            row.gold = session.gold
            row.hp = session.hp
            row.score = session.score
            row.kills = session.kills
            row.waves_survived = session.waves_survived
            row.kill_value = session.kill_value
            row.cost_total = session.cost_total
            row.time_total = session.time_total
            row.health_origin = session.health_origin
            row.health_final = session.health_final
            row.time_exclude_prepare = session.time_exclude_prepare
            row.total_score = session.total_score
            row.reflection_text = session.reflection_text
            row.ended_at = ended_at
        else:
            row = GameSessionModel(
                id=session.id,
                user_id=session.user_id,
                star_rating=int(session.level),
                initial_answer=session.initial_answer,
                practice_mode=session.practice_mode,
                is_preview=session.is_preview,
                challenge_id=session.challenge_id,
                rng_seed=session.rng_seed,
                replay_version=session.replay_version,
                path_config=session.path_config,
                status=session.status.value,
                current_wave=session.current_wave,
                gold=session.gold,
                hp=session.hp,
                score=session.score,
                kills=session.kills,
                waves_survived=session.waves_survived,
                kill_value=session.kill_value,
                cost_total=session.cost_total,
                time_total=session.time_total,
                health_origin=session.health_origin,
                health_final=session.health_final,
                time_exclude_prepare=session.time_exclude_prepare,
                total_score=session.total_score,
                reflection_text=session.reflection_text,
                started_at=started_at,
                ended_at=ended_at,
            )
            self._db.add(row)
        self._db.flush()

    def save_all(self, sessions: list[GameSession]) -> None:
        for s in sessions:
            self.save(s)

    def find_reflections_for_users(
        self, user_ids: list[str], limit: int = 100
    ) -> list[GameSession]:
        if not user_ids:
            return []
        rows = (
            self._db.query(GameSessionModel)
            .filter(
                GameSessionModel.user_id.in_(user_ids),
                GameSessionModel.status == SessionStatus.COMPLETED.value,
                GameSessionModel.reflection_text.isnot(None),
            )
            .order_by(GameSessionModel.ended_at.desc())
            .limit(limit)
            .all()
        )
        return [self._to_domain(r) for r in rows]

    def find_recent_completed_by_student(
        self, student_id: str, limit: int = 10
    ) -> list[GameSession]:
        rows = (
            self._db.query(GameSessionModel)
            .filter(
                GameSessionModel.user_id == student_id,
                GameSessionModel.status == SessionStatus.COMPLETED.value,
            )
            .order_by(
                GameSessionModel.ended_at.desc(),
                GameSessionModel.started_at.desc(),
            )
            .limit(limit)
            .all()
        )
        return [self._to_domain(r) for r in rows]

    def compute_ia_recent_accuracy(self, user_id: str, window: int = 10) -> float:
        # Last ``window`` completed sessions ordered by ended_at DESC, with
        # started_at as a tiebreaker so rapid sequential ends (microsecond
        # collisions in tests, clock skew on retries) still order in the
        # direction of "more recent first". Empty history returns 0.0 so
        # new players see full label scaffolding.
        rows = (
            self._db.query(GameSessionModel.initial_answer)
            .filter(
                GameSessionModel.user_id == user_id,
                GameSessionModel.status == SessionStatus.COMPLETED.value,
            )
            .order_by(
                GameSessionModel.ended_at.desc(),
                GameSessionModel.started_at.desc(),
            )
            .limit(window)
            .all()
        )
        if not rows:
            return 0.0
        correct = sum(1 for r in rows if bool(r[0]))
        return correct / len(rows)

    def has_correct_ia_session(self, user_id: str) -> bool:
        # initial_answer is a Boolean column set once at creation; status is
        # not part of the predicate (see protocol docstring for rationale).
        return self._db.query(GameSessionModel.id).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.initial_answer.is_(True),
        ).first() is not None

    def get_cumulative_stats(self, user_id: str) -> CumulativeStats:
        completed = SessionStatus.COMPLETED.value
        row = self._db.query(
            func.coalesce(func.sum(GameSessionModel.kills), 0).label("total_kills"),
            func.coalesce(func.sum(GameSessionModel.score), 0).label("total_score"),
            func.coalesce(func.sum(GameSessionModel.waves_survived), 0).label("total_waves"),
            func.count(GameSessionModel.id).label("total_sessions"),
        ).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == completed,
        ).one()

        stars_played = {
            r[0] for r in
            self._db.query(GameSessionModel.star_rating)
            .filter(GameSessionModel.user_id == user_id, GameSessionModel.status == completed)
            .distinct()
            .all()
        }

        return CumulativeStats(
            total_kills=row.total_kills,
            total_score=row.total_score,
            total_waves=row.total_waves,
            total_sessions=row.total_sessions,
            stars_played=stars_played,
        )

    # PB-detection window for the self-view history; mirrors the leaderboard
    # repo's cap so a pathological history can't load unbounded rows. COUNT(*)
    # is unaffected, so page metadata stays correct past this bound.
    _USER_HISTORY_WINDOW = 10000

    def get_user_session_history(
        self, user_id: str, level: int | None = None
    ) -> tuple[list[SessionHistoryEntry], int]:
        # BUG-010: self-view timeline sourced from the user's own completed
        # game_sessions, INCLUDING preview/practice runs (the public boards stay
        # leaderboard-table-backed). Newest-first by completion time.
        completed = SessionStatus.COMPLETED.value
        q = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == completed,
        )
        if level is not None:
            q = q.filter(GameSessionModel.star_rating == level)
        total = q.with_entities(func.count(GameSessionModel.id)).scalar() or 0
        rows = (
            q.order_by(
                func.coalesce(
                    GameSessionModel.ended_at, GameSessionModel.started_at
                ).desc(),
                GameSessionModel.id.desc(),
            )
            .limit(self._USER_HISTORY_WINDOW)
            .all()
        )
        return [
            SessionHistoryEntry(
                id=r.id,
                level=int(r.star_rating),
                score=int(r.score),
                kills=int(r.kills),
                waves_survived=int(r.waves_survived),
                created_at=_ensure_utc(r.ended_at) or _ensure_utc(r.started_at),
                total_score=r.total_score,
            )
            for r in rows
        ], int(total)

    def aggregate_stats_for_users(self, user_ids: list[str]) -> dict[str, dict]:
        if not user_ids:
            return {}
        completed = SessionStatus.COMPLETED.value

        # Per-user aggregate over competition-eligible completed sessions.
        # BUG-011: exclude practice_mode and is_preview so this teacher/admin
        # dashboard ranks the same population as every other leaderboard surface
        # (spec line 84: practice runs are leaderboard-ineligible). Without this a
        # student could climb the class ranking via practice/sandbox runs.
        agg_rows = (
            self._db.query(
                GameSessionModel.user_id,
                func.count(GameSessionModel.id).label("sessions_played"),
                func.coalesce(func.avg(GameSessionModel.star_rating), 0.0).label("avg_stars"),
                func.coalesce(func.sum(GameSessionModel.score), 0).label("total_score"),
                func.max(GameSessionModel.ended_at).label("last_played_at"),
            )
            .filter(
                GameSessionModel.user_id.in_(user_ids),
                GameSessionModel.status == completed,
                GameSessionModel.practice_mode.is_(False),
                GameSessionModel.is_preview.is_(False),
            )
            .group_by(GameSessionModel.user_id)
            .all()
        )

        # Reflection counts as a separate query — adding a CASE WHEN to the
        # main aggregate would prevent the planner from using the
        # (user_id, status) index path cleanly.
        refl_rows = (
            self._db.query(
                GameSessionModel.user_id,
                func.count(GameSessionModel.id).label("reflections_count"),
            )
            .filter(
                GameSessionModel.user_id.in_(user_ids),
                GameSessionModel.status == completed,
                # BUG-011: keep the reflections count consistent with the main
                # aggregate above — practice/preview runs are excluded here too.
                GameSessionModel.practice_mode.is_(False),
                GameSessionModel.is_preview.is_(False),
                GameSessionModel.reflection_text.isnot(None),
                func.length(GameSessionModel.reflection_text) > 0,
            )
            .group_by(GameSessionModel.user_id)
            .all()
        )
        refl_by_user = {uid: cnt for uid, cnt in refl_rows}

        out: dict[str, dict] = {}
        for row in agg_rows:
            out[row.user_id] = {
                "sessions_played": int(row.sessions_played),
                "average_stars": float(row.avg_stars) if row.avg_stars is not None else 0.0,
                "total_score": int(row.total_score),
                "last_played_at": _ensure_utc(row.last_played_at),
                "reflections_count": int(refl_by_user.get(row.user_id, 0)),
            }
        return out

    @staticmethod
    def _to_domain(row: GameSessionModel) -> GameSession:
        session = GameSession(
            id=row.id,
            user_id=row.user_id,
            level=Level(row.star_rating),
            status=SessionStatus(row.status),
            current_wave=row.current_wave,
            gold=row.gold,
            hp=row.hp,
            score=row.score,
            kills=row.kills,
            waves_survived=row.waves_survived,
            initial_answer=bool(row.initial_answer),
            practice_mode=bool(row.practice_mode),
            is_preview=bool(row.is_preview),
            challenge_id=row.challenge_id,
            rng_seed=row.rng_seed,
            replay_version=row.replay_version if row.replay_version is not None else 1,
            started_at=_ensure_utc(row.started_at),
            ended_at=_ensure_utc(row.ended_at),
        )
        session.path_config = row.path_config
        session.kill_value = row.kill_value
        session.cost_total = row.cost_total
        session.time_total = row.time_total
        session.health_origin = row.health_origin
        session.health_final = row.health_final
        session.time_exclude_prepare = row.time_exclude_prepare
        session.total_score = row.total_score
        session.reflection_text = row.reflection_text
        return session


class StartedAtMutationError(RuntimeError):
    """Raised when a caller attempts to persist a changed started_at."""


def _ensure_utc(value: datetime | None) -> datetime | None:
    # All DateTime columns are tz-aware under PG, so this is a safety net that
    # normalises any stray naive datetime to UTC before it hits downstream
    # comparisons (e.g. started_at < now - STALE_CUTOFF).
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
