"""Disambiguate SQLAlchemy IntegrityError causes without fuzzy string matching.

Callers need to tell "duplicate session_id in leaderboard" (→ 409) from any
other integrity violation (→ 500). psycopg exposes the constraint name on
`orig.diag.constraint_name`, which is the authoritative source — exact match,
unaffected by message wording changes between PG versions.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError


def is_constraint_violation(err: IntegrityError, *, constraint_name: str) -> bool:
    """Check whether `err` was raised by the named constraint."""
    orig = getattr(err, "orig", None)
    if orig is None:
        return False
    diag = getattr(orig, "diag", None)
    if diag is None:
        return False
    return getattr(diag, "constraint_name", None) == constraint_name
