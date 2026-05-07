"""Study domain — Empirical Validity Probe (Pedagogical_Backlog_Spec.md §27).

Owns:
  * Deterministic group assignment (treatment vs. control) by user-id hash.
  * Probe attempt and affect-survey value objects so the application layer
    can persist them without re-encoding the rules.

Theory anchors: Anderson & Shattuck (2012) on minimum-defensible study
design; Barnett & Ceci (2002) on the importance of distinguishing near
versus far transfer through delayed-test items.
"""
from .group_assignment import (
    StudyGroup,
    assign_group,
    is_valid_study_id,
)
from .probe_keys import (
    ITEMS_PER_FORM,
    PROBE_FORMS,
    grade,
)

__all__ = [
    "ITEMS_PER_FORM",
    "PROBE_FORMS",
    "StudyGroup",
    "assign_group",
    "grade",
    "is_valid_study_id",
]
