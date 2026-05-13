"""Lowest-competency → suggested-challenge mapping for the teacher dashboard.

Pedagogical_Backlog_Spec.md §9.3 mandates the exact text per competency so
the rule is auditable and deterministic. Keep this module dependency-free —
it is read by the application service, asserted against by tests, and
must not import any router or persistence symbol.
"""
from __future__ import annotations

from .competencies import Competency
from .competency_estimator import Beta, mean

# Spec §9.3 — frozen wording. Editing a string here is a curriculum change,
# not a typo fix; downstream tests assert exact equality.
SUGGESTION_TABLE: dict[Competency, str] = {
    Competency.MAGIC: "Magic-tower-only run at Star ≤ current",
    Competency.RADAR: "Radar-only run; keep arc < 60°",
    Competency.MATRIX: "Matrix-pair run; 2+ pairs required",
    Competency.LIMIT: "Limit-tower run with frugal-spend constraint",
    Competency.CALCULUS: "Calculus-tower-only run, minimum 2 pets alive",
    Competency.CHAIN_RULE: "Replay a Boss Type-B level",
    Competency.PROBABILITY: "Trigger Monty-Hall and switch every time",
}


def lowest_competency(posteriors: dict[Competency, Beta]) -> Competency:
    """Return the competency with the smallest posterior mean.

    Ties are broken by ``Competency`` enum-declaration order so the rule is
    deterministic — two competencies sitting at the uniform prior must always
    map to the same suggestion across requests.
    """
    ordered = list(Competency)
    return min(ordered, key=lambda c: (mean(posteriors[c]), ordered.index(c)))


def suggestion_for(posteriors: dict[Competency, Beta]) -> tuple[Competency, str]:
    """Pick the lowest-mean competency and return its suggestion text."""
    lowest = lowest_competency(posteriors)
    return lowest, SUGGESTION_TABLE[lowest]
