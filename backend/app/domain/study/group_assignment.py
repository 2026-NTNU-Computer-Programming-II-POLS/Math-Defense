"""Deterministic group assignment for the empirical validity probe (§27.2).

A user is mapped to a group by hashing ``study_id || ':' || user_id`` with a
stable cryptographic hash and bucketing the leading 32 bits modulo two.
Stable means:

  * Re-running the assignment for the same (study_id, user_id) always
    returns the same group, regardless of process restarts. This is the
    invariant we rely on so the CSV export can be regenerated weeks after
    a participant's last login without storing the assignment in the DB.

  * Different ``study_id`` values produce independent draws. A pilot run
    and the real study can therefore use disjoint group_id namespaces
    without leaking pilot bias into the main study.

We deliberately use BLAKE2b (stdlib, no external dep) rather than Python's
``hash()``: the latter is salted per process since 3.3, which would silently
break the determinism contract.
"""
from __future__ import annotations

import hashlib
import re
from enum import Enum

from app.domain.errors import DomainValueError

# Allow ASCII letters, digits, dash, underscore. Length 1..64. Constrained
# so the value can flow through URL paths and CSV filenames without escaping.
_STUDY_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class StudyGroup(str, Enum):
    """Two-arm assignment. ``A`` = treatment (plays Math Defense),
    ``B`` = control (textbook practice). String-valued so it serialises
    cleanly into CSV and JSON without a custom encoder."""

    A = "A"
    B = "B"


def is_valid_study_id(study_id: str) -> bool:
    return bool(_STUDY_ID_PATTERN.match(study_id or ""))


def assign_group(user_id: str, study_id: str) -> StudyGroup:
    """Return the deterministic group for ``user_id`` within ``study_id``.

    Raises:
        DomainValueError: if ``user_id`` is empty or ``study_id`` does not
            match the allowed character set. The router validates inputs as
            well; the domain re-checks so non-HTTP callers (e.g. a future
            CLI export tool) cannot bypass the rule.
    """
    if not user_id:
        raise DomainValueError("user_id must not be empty")
    if not is_valid_study_id(study_id):
        raise DomainValueError(
            "study_id must be 1..64 chars of [A-Za-z0-9_-]"
        )
    payload = f"{study_id}:{user_id}".encode("utf-8")
    digest = hashlib.blake2b(payload, digest_size=8).digest()
    bucket = int.from_bytes(digest[:4], "big") % 2
    return StudyGroup.A if bucket == 0 else StudyGroup.B
