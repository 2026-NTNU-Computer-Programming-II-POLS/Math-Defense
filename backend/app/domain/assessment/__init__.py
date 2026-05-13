"""Assessment domain — Evidence-Centred Design substrate (ECD; Mislevy et al. 2003).

Exposes the competency taxonomy and Q-matrix (Tatsuoka 1983) as data so future
proficiency-estimation work (Pedagogical_Backlog_Spec.md items #8 and #9) can
consume them without the events layer having to know about scoring.
"""
from .competencies import Competency
from .competency_estimator import (
    UNIFORM_PRIOR,
    Beta,
    BetaSummary,
    ci95,
    mean,
    update,
)
from .competency_state import CompetencyState
from .q_matrix import QMatrix, UnknownEventError
from .q_matrix_defs import DIAGNOSTIC_EVENTS, Q_MATRIX
from .suggestions import SUGGESTION_TABLE, lowest_competency, suggestion_for

__all__ = [
    "Beta",
    "BetaSummary",
    "Competency",
    "CompetencyState",
    "DIAGNOSTIC_EVENTS",
    "QMatrix",
    "Q_MATRIX",
    "SUGGESTION_TABLE",
    "UNIFORM_PRIOR",
    "UnknownEventError",
    "ci95",
    "lowest_competency",
    "mean",
    "suggestion_for",
    "update",
]
