"""Server-side answer keys for the study probe forms.

Kept on the server, not the frontend bundle, so a participant who reads
the JS source cannot infer the correct answers. The frontend probe runner
ships *items* (stem + options) only; the backend grader applies the key
when ``submit_probe`` is called.

Item ids follow the pattern ``<form>:<index>`` (e.g. ``pre:1`` ... ``pre:10``)
so the same item bank module on the frontend can map cleanly to keys here.

Three forms in this file:
  * ``pre``   — 10 items administered before the study starts.
  * ``post``  — same items as ``pre``, options reordered (see §27.3 step 4).
                Reordering is encoded in the keys themselves; the frontend
                bank is responsible for the actual permutation.
  * ``delay`` — 10 *new* items targeting the same deep structure but with
                different surface features (Barnett & Ceci 2002 §27.3 step 5).

The actual content is stubbed with placeholder labels (``A``..``D``) so
the engineering enabler is shippable without depending on the (separate)
content-writing workstream. Replace with real keys before running the
study; the export schema and grading code do not need to change.
"""
from __future__ import annotations

from app.domain.errors import DomainValueError

# Allowed forms. The router and the service both check against this set
# so an unknown form value is rejected at every layer.
PROBE_FORMS = frozenset({"pre", "post", "delay"})

# Total items per form. A single constant so the grader and the
# acceptance-criteria check cannot drift.
ITEMS_PER_FORM = 10


PROBE_ANSWER_KEYS: dict[str, dict[str, str]] = {
    "pre": {f"pre:{i}": "A" for i in range(1, ITEMS_PER_FORM + 1)},
    "post": {f"post:{i}": "A" for i in range(1, ITEMS_PER_FORM + 1)},
    "delay": {f"delay:{i}": "A" for i in range(1, ITEMS_PER_FORM + 1)},
}


def grade(form: str, responses: list[dict]) -> tuple[int, list[dict]]:
    """Apply the answer key to a probe submission.

    ``responses`` is a list of ``{"item_id": str, "selected": str}``
    payloads from the frontend. Returns ``(score, enriched_responses)``
    where the enriched list adds a ``correct: bool`` flag per item so
    the export can show item-level analytics later.
    """
    if form not in PROBE_FORMS:
        raise DomainValueError(f"unknown form: {form!r}")
    key = PROBE_ANSWER_KEYS[form]
    if len(responses) != ITEMS_PER_FORM:
        raise DomainValueError(
            f"expected {ITEMS_PER_FORM} responses, got {len(responses)}"
        )

    enriched: list[dict] = []
    score = 0
    seen: set[str] = set()
    for r in responses:
        item_id = r.get("item_id")
        selected = r.get("selected")
        if not isinstance(item_id, str) or not isinstance(selected, str):
            raise DomainValueError(
                "each response must include item_id and selected as strings"
            )
        if item_id in seen:
            raise DomainValueError(f"duplicate response for {item_id}")
        seen.add(item_id)
        if item_id not in key:
            raise DomainValueError(
                f"item_id {item_id!r} is not part of form {form!r}"
            )
        is_correct = key[item_id] == selected
        if is_correct:
            score += 1
        enriched.append(
            {"item_id": item_id, "selected": selected, "correct": is_correct}
        )
    return score, enriched
