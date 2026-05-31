"""SeasonApplicationService — admin-managed seasonal achievement windows."""
from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from app.domain.achievement.definitions import AchievementDef, get_all_defs
from app.domain.season.aggregate import Season

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.season.repository import SeasonRepository


class SeasonApplicationService:
    def __init__(self, season_repo: SeasonRepository, uow: UnitOfWork) -> None:
        self._season_repo = season_repo
        self._uow = uow

    def upsert_season(
        self,
        season_id: str,
        name: str,
        starts_at: datetime,
        ends_at: datetime,
    ) -> Season:
        # Intentionally permissive on season_id: a season is a forward-looking
        # window that achievements get tagged into over time, so an admin may
        # legitimately create the window before any achievement references it
        # (no seasonal defs ship today). A season that currently matches zero
        # achievements is inert rather than wrong — the UI flags that case so
        # the admin has feedback without the backend blocking the setup flow.
        season = Season.create(
            season_id=season_id, name=name, starts_at=starts_at, ends_at=ends_at,
        )
        with self._uow:
            self._season_repo.save(season)
            self._uow.commit()
        return season

    def list_seasons(self) -> list[dict]:
        now = datetime.now(UTC)
        admin_seasons = {s.season_id: s for s in self._season_repo.find_all()}
        seen: set[str] = set()
        out: list[dict] = []

        for sid, s in admin_seasons.items():
            seen.add(sid)
            out.append(self._serialize(sid, s.name, s.starts_at, s.ends_at, now))

        # Code-defined defaults: include any season_id seen on a def that the
        # admin has not overridden, so the UI can still display the static
        # window even before the admin promotes it.
        defaults: dict[str, AchievementDef] = {}
        for d in get_all_defs():
            if d.season_id and d.season_id not in seen and d.season_id not in defaults:
                defaults[d.season_id] = d
        for sid, d in defaults.items():
            out.append(
                self._serialize(
                    sid,
                    sid,
                    d.season_starts_at,
                    d.season_ends_at,
                    now,
                )
            )

        out.sort(key=lambda s: s["starts_at"] or "", reverse=True)
        return out

    @staticmethod
    def _serialize(
        season_id: str,
        name: str,
        starts_at: datetime | None,
        ends_at: datetime | None,
        now: datetime,
    ) -> dict:
        active = bool(
            starts_at and ends_at and starts_at <= now < ends_at
        )
        archived = bool(ends_at and ends_at <= now)
        return {
            "season_id": season_id,
            "name": name,
            "starts_at": starts_at.isoformat() if starts_at else None,
            "ends_at": ends_at.isoformat() if ends_at else None,
            "active": active,
            "archived": archived,
            "achievement_ids": [
                d.id for d in get_all_defs() if d.season_id == season_id
            ],
        }
