"""Beta-posterior competency estimator — Pedagogical_Backlog_Spec.md §8.

Pure functions over an immutable Beta value object. The estimator stays
event-id-agnostic on purpose: callers translate evidence → (weight, success)
via the Q-matrix, so this module has no coupling to gameplay vocabulary and
can be exercised with well-known Beta moments in unit tests.

Update rule (§8.3) given evidence with weight ``w`` and success ``s ∈ {0, 1}``:
    α' = α + w · s
    β' = β + w · (1 − s)

Initial prior is ``Beta(1, 1)`` — uniform — so a learner with no events has
posterior mean exactly 0.5.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.errors import DomainValueError


@dataclass(frozen=True)
class Beta:
    """Beta distribution shape parameters.

    Both ``alpha`` and ``beta`` must be strictly positive — the Beta pdf is
    undefined at 0, and a non-positive shape would also leave ``mean`` and
    ``ci95`` ill-defined.
    """

    alpha: float
    beta: float

    def __post_init__(self) -> None:
        if not isinstance(self.alpha, (int, float)) or not isinstance(self.beta, (int, float)):
            raise DomainValueError(f"Beta shapes must be numeric, got ({self.alpha!r}, {self.beta!r})")
        if not (self.alpha > 0.0 and self.beta > 0.0):
            raise DomainValueError(f"Beta shapes must be > 0, got alpha={self.alpha} beta={self.beta}")


UNIFORM_PRIOR: Beta = Beta(1.0, 1.0)


def update(prior: Beta, weight: float, success: bool) -> Beta:
    """Bayesian update of a Beta posterior given one evidence event.

    ``weight`` may be 0 (no-op) but not negative — a negative weight would
    drive shapes below the positivity floor and is never produced by the
    Q-matrix (weights are bounded to [0, 1]).
    """
    if not isinstance(weight, (int, float)):
        raise DomainValueError(f"weight must be numeric, got {weight!r}")
    if weight < 0.0:
        raise DomainValueError(f"weight must be >= 0, got {weight}")
    s = 1.0 if success else 0.0
    return Beta(
        alpha=prior.alpha + weight * s,
        beta=prior.beta + weight * (1.0 - s),
    )


def mean(b: Beta) -> float:
    return b.alpha / (b.alpha + b.beta)


def ci95(b: Beta) -> tuple[float, float]:
    """Approximate central 95% credible interval via the Wilson-Hilferty
    normal approximation to the Beta quantile.

    A closed-form ``betaincinv`` is not in the standard library; the normal
    approximation is good enough for the dashboard (errors ≲ 0.02 for
    α + β ≥ 4) and avoids pulling in scipy. For tiny shape totals — e.g. the
    uniform prior — the approximation can clip outside [0, 1], so the result
    is clamped before returning.
    """
    a, b_ = b.alpha, b.beta
    m = a / (a + b_)
    var = (a * b_) / (((a + b_) ** 2) * (a + b_ + 1.0))
    sd = math.sqrt(var)
    z = 1.959963984540054  # two-sided 95% normal quantile
    lo = max(0.0, m - z * sd)
    hi = min(1.0, m + z * sd)
    return (lo, hi)


@dataclass(frozen=True)
class BetaSummary:
    """Read-model surface for routers/UI — the dashboard does not need shape
    parameters, only the point estimate and credible interval."""

    alpha: float
    beta: float
    mean: float
    ci_low: float
    ci_high: float

    @classmethod
    def from_beta(cls, b: Beta) -> "BetaSummary":
        lo, hi = ci95(b)
        return cls(alpha=b.alpha, beta=b.beta, mean=mean(b), ci_low=lo, ci_high=hi)
