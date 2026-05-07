"""SeasonRepository — abstract interface (Protocol)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.season.aggregate import Season


@runtime_checkable
class SeasonRepository(Protocol):
    def find_all(self) -> list[Season]: pass

    def find_by_id(self, season_id: str) -> Season | None: pass

    def save(self, season: Season) -> None: pass

    def delete(self, season_id: str) -> None: pass
