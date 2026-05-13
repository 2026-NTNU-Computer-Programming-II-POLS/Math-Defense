"""TalentTree domain service.

Encapsulates the rules previously inlined in TalentApplicationService:
- spent / available points budget
- max-level cap per node
- prerequisite chains

Application code loads the user's allocations + earned-points total into a
TalentTree, calls one of its methods (e.g. ``allocate``), and persists the
updated allocations. Domain errors are raised here, not in the service.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.domain.errors import (
    InsufficientTalentPointsError,
    MaxLevelReachedError,
    PrerequisiteNotMetError,
    TalentNodeNotFoundError,
)
from app.domain.talent.aggregate import TalentAllocation
from app.domain.talent.definitions import TALENT_NODE_DEFS

logger = logging.getLogger(__name__)


@dataclass
class AllocationOutcome:
    """Result of TalentTree.allocate. ``upgraded`` is the existing allocation
    whose level was bumped (None when a new node was unlocked). ``created`` is
    the freshly-created allocation (None when an existing one was upgraded)."""
    upgraded: TalentAllocation | None
    created: TalentAllocation | None


class TalentTree:
    """In-memory view of one user's talent tree, with mutation methods that
    enforce all tree-level invariants. Not persisted directly; the caller
    saves the affected ``TalentAllocation`` instances back through the
    repository after mutation."""

    def __init__(self, user_id: str, allocations: list[TalentAllocation], earned_points: int) -> None:
        self._user_id = user_id
        self._allocations = list(allocations)
        self._earned = earned_points

    @property
    def points_earned(self) -> int:
        return self._earned

    @property
    def points_spent(self) -> int:
        total = 0
        for alloc in self._allocations:
            node_def = TALENT_NODE_DEFS.get(alloc.talent_node_id)
            if node_def is None:
                # Stale allocation: a persisted node whose definition was removed.
                # Treat as 0-cost so a retired node doesn't break every player's
                # tree load. Emit telemetry so the data issue is visible.
                logger.warning(
                    "talent_node_undefined node_id=%s user_id=%s",
                    alloc.talent_node_id, self._user_id,
                )
                continue
            total += node_def.cost_per_level * alloc.current_level
        return total

    @property
    def points_available(self) -> int:
        return self._earned - self.points_spent

    def _level_of(self, node_id: str) -> int:
        for alloc in self._allocations:
            if alloc.talent_node_id == node_id:
                return alloc.current_level
        return 0

    def _find(self, node_id: str) -> TalentAllocation | None:
        for alloc in self._allocations:
            if alloc.talent_node_id == node_id:
                return alloc
        return None

    def allocate(self, talent_node_id: str) -> AllocationOutcome:
        """Spend one point on ``talent_node_id``. Validates budget, max-level
        cap, and prerequisites. Returns the affected allocation(s) so the
        application service can save them."""
        node_def = TALENT_NODE_DEFS.get(talent_node_id)
        if node_def is None:
            raise TalentNodeNotFoundError(f"Unknown talent node: {talent_node_id}")

        if self.points_available < node_def.cost_per_level:
            raise InsufficientTalentPointsError(
                f"Need {node_def.cost_per_level} points, have {self.points_available}"
            )

        current_level = self._level_of(talent_node_id)
        if current_level >= node_def.max_level:
            raise MaxLevelReachedError(
                f"Node {talent_node_id} already at max level {node_def.max_level}"
            )

        for prereq_id in node_def.prerequisites:
            prereq_def = TALENT_NODE_DEFS.get(prereq_id)
            if prereq_def is None:
                continue
            if self._level_of(prereq_id) < 1:
                raise PrerequisiteNotMetError(
                    f"Prerequisite not met: {prereq_def.name}"
                )

        existing = self._find(talent_node_id)
        if existing is not None:
            existing.upgrade(node_def.max_level)
            return AllocationOutcome(upgraded=existing, created=None)

        new_alloc = TalentAllocation.create(self._user_id, talent_node_id)
        self._allocations.append(new_alloc)
        return AllocationOutcome(upgraded=None, created=new_alloc)
