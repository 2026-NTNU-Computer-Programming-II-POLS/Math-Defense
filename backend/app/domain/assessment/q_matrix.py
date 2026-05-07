"""Q-matrix value object — Tatsuoka (1983) competency-evidence mapping.

A Q-matrix declares which latent competencies each evidence event (achievement
unlock, diagnostic answer) loads on. Stored as data so future scoring/IRT/BKT
machinery (Pedagogical_Backlog_Spec.md items #8 and #9) can be plugged in
without touching event-emission code.

Construction validates row weights and bounds; lookups raise on unknown events
so callers cannot silently treat an event as zero-evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from app.domain.errors import DomainValueError

from .competencies import Competency


class UnknownEventError(DomainValueError):
    """Raised when QMatrix.weight is asked about an event id with no row."""


@dataclass(frozen=True)
class QMatrix:
    """Immutable mapping {event_id -> {Competency -> weight in [0, 1]}}.

    Missing competencies in a row read as 0.0. Row sums are bounded by [0, 7]
    rather than [0, 1] — diagnostic events are intentionally unit-loaded on a
    single competency, so normalising across rows would distort their evidence.
    """

    _rows: Mapping[str, Mapping[Competency, float]]

    def __post_init__(self) -> None:
        frozen: dict[str, Mapping[Competency, float]] = {}
        for event_id, row in self._rows.items():
            if not isinstance(event_id, str) or not event_id:
                raise DomainValueError(f"Q-matrix event id must be non-empty str, got {event_id!r}")
            for comp, weight in row.items():
                if not isinstance(comp, Competency):
                    raise DomainValueError(
                        f"Q-matrix row for {event_id!r} has non-Competency key {comp!r}"
                    )
                if not isinstance(weight, (int, float)):
                    raise DomainValueError(
                        f"Q-matrix weight for {event_id!r}/{comp.value} must be numeric"
                    )
                if not (0.0 <= float(weight) <= 1.0):
                    raise DomainValueError(
                        f"Q-matrix weight for {event_id!r}/{comp.value}={weight} out of [0, 1]"
                    )
            row_sum = sum(float(w) for w in row.values())
            if not (0.0 <= row_sum <= 7.0):
                raise DomainValueError(
                    f"Q-matrix row {event_id!r} sum {row_sum} out of [0, 7]"
                )
            frozen[event_id] = MappingProxyType({c: float(w) for c, w in row.items()})
        object.__setattr__(self, "_rows", MappingProxyType(frozen))

    def weight(self, event_id: str, competency: Competency) -> float:
        if event_id not in self._rows:
            raise UnknownEventError(f"Unknown Q-matrix event: {event_id!r}")
        return self._rows[event_id].get(competency, 0.0)

    def events(self) -> frozenset[str]:
        return frozenset(self._rows.keys())
