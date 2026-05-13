"""ChallengeConstraints — typed value object for the §23.3 knob surface.

Frozen dataclass (not a real expression DSL). Constructed from raw JSON at
the API edge by the Pydantic schema, then enforced as an immutable invariant
on the `Challenge` aggregate. Round-trips to and from a JSONB column via
`to_dict` / `from_dict`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.domain.challenge.tower_types import (
    ALLOWED_FORBIDDEN_MECHANICS,
    TowerType,
)
from app.domain.errors import DomainValueError

WAVE_COUNT_MIN = 1
WAVE_COUNT_MAX = 6
TARGET_SCORE_MIN = 1
TARGET_SCORE_MAX = 100_000

# Default ranges for unbounded magic coefficients — match
# frontend/src/components/game/MagicModePanel.vue slider min/max so the
# fallback bounds are visually consistent with the un-constrained UI.
MAGIC_DEFAULT_BOUNDS: dict[str, tuple[float, float]] = {
    "a": (-3.0, 3.0),
    "b": (-5.0, 5.0),
    "c": (-5.0, 5.0),
}


@dataclass(frozen=True)
class MagicParamBounds:
    """Optional per-coefficient bounds for the magic tower (a·x² + b·x + c)."""

    a: tuple[float, float] | None = None
    b: tuple[float, float] | None = None
    c: tuple[float, float] | None = None

    def __post_init__(self) -> None:
        for name, rng in (("a", self.a), ("b", self.b), ("c", self.c)):
            if rng is None:
                continue
            lo, hi = rng
            if lo > hi:
                raise DomainValueError(
                    f"magic_param_bounds.{name}: lo must be <= hi"
                )
            default_lo, default_hi = MAGIC_DEFAULT_BOUNDS[name]
            if lo < default_lo or hi > default_hi:
                raise DomainValueError(
                    f"magic_param_bounds.{name}: outside default range "
                    f"[{default_lo}, {default_hi}]"
                )

    def is_empty(self) -> bool:
        return self.a is None and self.b is None and self.c is None

    def to_dict(self) -> dict[str, list[float]]:
        out: dict[str, list[float]] = {}
        for name in ("a", "b", "c"):
            rng = getattr(self, name)
            if rng is not None:
                out[name] = [float(rng[0]), float(rng[1])]
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> MagicParamBounds:
        if not data:
            return cls()
        kwargs: dict[str, tuple[float, float] | None] = {}
        for name in ("a", "b", "c"):
            rng = data.get(name)
            if rng is None:
                continue
            if not isinstance(rng, (list, tuple)) or len(rng) != 2:
                raise DomainValueError(
                    f"magic_param_bounds.{name} must be a [lo, hi] pair"
                )
            kwargs[name] = (float(rng[0]), float(rng[1]))
        return cls(**kwargs)


@dataclass(frozen=True)
class ChallengeConstraints:
    """Immutable five-knob surface (spec §23.3).

    Invariants enforced on construction:
    1. `allowed_towers` non-empty.
    2. `forbidden_mechanics` ⊆ ALLOWED_FORBIDDEN_MECHANICS.
    3. `wave_count` ∈ [1, 6], `target_score` ∈ [1, 100_000].
    4. magic param bounds: lo ≤ hi and within MAGIC_DEFAULT_BOUNDS.
    """

    allowed_towers: frozenset[TowerType]
    wave_count: int
    target_score: int
    magic_param_bounds: MagicParamBounds = field(default_factory=MagicParamBounds)
    forbidden_mechanics: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        if not self.allowed_towers:
            raise DomainValueError("allowed_towers must not be empty")
        if not all(isinstance(t, TowerType) for t in self.allowed_towers):
            raise DomainValueError("allowed_towers entries must be TowerType")
        unknown = self.forbidden_mechanics - ALLOWED_FORBIDDEN_MECHANICS
        if unknown:
            raise DomainValueError(
                f"forbidden_mechanics: unknown values {sorted(unknown)}"
            )
        if not (WAVE_COUNT_MIN <= self.wave_count <= WAVE_COUNT_MAX):
            raise DomainValueError(
                f"wave_count must be in [{WAVE_COUNT_MIN}, {WAVE_COUNT_MAX}]"
            )
        if not (TARGET_SCORE_MIN <= self.target_score <= TARGET_SCORE_MAX):
            raise DomainValueError(
                f"target_score must be in [{TARGET_SCORE_MIN}, {TARGET_SCORE_MAX}]"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed_towers": sorted(t.value for t in self.allowed_towers),
            "magic_param_bounds": self.magic_param_bounds.to_dict(),
            "forbidden_mechanics": sorted(self.forbidden_mechanics),
            "wave_count": self.wave_count,
            "target_score": self.target_score,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ChallengeConstraints:
        try:
            towers = frozenset(TowerType(t) for t in data["allowed_towers"])
        except (KeyError, ValueError) as e:
            raise DomainValueError(f"allowed_towers invalid: {e}") from e
        return cls(
            allowed_towers=towers,
            wave_count=int(data["wave_count"]),
            target_score=int(data["target_score"]),
            magic_param_bounds=MagicParamBounds.from_dict(
                data.get("magic_param_bounds")
            ),
            forbidden_mechanics=frozenset(data.get("forbidden_mechanics", [])),
        )
