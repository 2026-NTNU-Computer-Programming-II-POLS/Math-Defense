"""Per-user competency-state aggregate — Pedagogical_Backlog_Spec.md §8.

Wraps a ``{Competency -> Beta}`` map and offers a single boundary —
``apply_event`` — that consults the Q-matrix to translate a raw evidence event
into one Beta update per loaded competency. Keeping the Q-matrix lookup inside
the aggregate (rather than the application service) means callers cannot
forget to skip zero-weight rows or reach in to mutate posteriors directly.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .competencies import Competency
from .competency_estimator import UNIFORM_PRIOR, Beta, update
from .q_matrix import QMatrix


@dataclass
class CompetencyState:
    """Mutable aggregate keyed by ``user_id``.

    ``_dirty`` tracks which competencies have been written since load so the
    repository can issue an UPDATE only for the rows that actually changed.
    The set is reset by ``mark_clean`` once persistence has flushed.
    """

    user_id: str
    _posteriors: dict[Competency, Beta] = field(default_factory=dict)
    _dirty: set[Competency] = field(default_factory=set)

    @classmethod
    def empty(cls, user_id: str) -> "CompetencyState":
        return cls(user_id=user_id, _posteriors={}, _dirty=set())

    @classmethod
    def from_rows(
        cls, user_id: str, rows: dict[Competency, Beta]
    ) -> "CompetencyState":
        return cls(user_id=user_id, _posteriors=dict(rows), _dirty=set())

    def posterior(self, competency: Competency) -> Beta:
        """Return the posterior for ``competency`` — ``Beta(1, 1)`` if no
        evidence has ever been recorded for this user × competency."""
        return self._posteriors.get(competency, UNIFORM_PRIOR)

    def all_posteriors(self) -> dict[Competency, Beta]:
        """Snapshot of every competency, materialising the uniform prior for
        any competency that has yet to receive evidence so callers can render
        the full taxonomy without per-competency conditionals."""
        return {c: self.posterior(c) for c in Competency}

    def apply_event(
        self, q_matrix: QMatrix, event_id: str, success: bool
    ) -> list[Competency]:
        """Apply one evidence event across every competency the row loads on.

        Zero-weight competencies are skipped to keep the dirty-set tight.
        Returns the list of competencies that were actually updated so the
        caller can log evidence application without a second pass over the
        Q-matrix row.
        """
        updated: list[Competency] = []
        for c in Competency:
            w = q_matrix.weight(event_id, c)
            if w == 0.0:
                continue
            prior = self.posterior(c)
            self._posteriors[c] = update(prior, w, success)
            self._dirty.add(c)
            updated.append(c)
        return updated

    @property
    def dirty(self) -> frozenset[Competency]:
        return frozenset(self._dirty)

    def dirty_posteriors(self) -> dict[Competency, Beta]:
        return {c: self._posteriors[c] for c in self._dirty}

    def mark_clean(self) -> None:
        self._dirty.clear()
