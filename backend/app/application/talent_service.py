"""TalentApplicationService — allocate, reset, and query talent points"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.errors import (
    InsufficientTalentPointsError,
    MaxLevelReachedError,
    PrerequisiteNotMetError,
    TalentNodeNotFoundError,
)
from app.domain.talent.aggregate import TalentAllocation
from app.domain.talent.definitions import TALENT_NODE_DEFS, get_all_nodes

if TYPE_CHECKING:
    from app.domain.achievement.repository import AchievementRepository
    from app.domain.talent.repository import TalentRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


class TalentApplicationService:
    def __init__(
        self,
        talent_repo: TalentRepository,
        achievement_repo: AchievementRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._talent_repo = talent_repo
        self._achievement_repo = achievement_repo
        self._uow = uow

    def _calculate_spent_points(self, allocations_list: list[TalentAllocation]) -> int:
        total = 0
        for alloc in allocations_list:
            node_def = TALENT_NODE_DEFS.get(alloc.talent_node_id)
            if not node_def:
                raise ValueError(f"Talent node '{alloc.talent_node_id}' has no definition — data integrity error")
            total += node_def.cost_per_level * alloc.current_level
        return total

    def get_tree(self, user_id: str) -> dict:
        alloc_list = self._talent_repo.find_by_user(user_id)
        allocations = {a.talent_node_id: a.current_level for a in alloc_list}
        earned = self._achievement_repo.sum_talent_points(user_id)
        spent = self._calculate_spent_points(alloc_list)

        nodes = []
        for n in get_all_nodes():
            nodes.append({
                "id": n.id,
                "tower_type": n.tower_type,
                "attribute": n.attribute,
                "name": n.name,
                "description": n.description,
                "max_level": n.max_level,
                "cost_per_level": n.cost_per_level,
                "effect_per_level": n.effect_per_level,
                "prerequisites": list(n.prerequisites),
                "current_level": allocations.get(n.id, 0),
            })

        return {
            "points_earned": earned,
            "points_spent": spent,
            "points_available": earned - spent,
            "nodes": nodes,
        }

    def get_modifiers(self, user_id: str) -> dict[str, dict[str, float]]:
        allocations = self._talent_repo.find_by_user(user_id)
        modifiers: dict[str, dict[str, float]] = {}
        for alloc in allocations:
            node_def = TALENT_NODE_DEFS.get(alloc.talent_node_id)
            if not node_def:
                continue
            tower = node_def.tower_type
            attr = node_def.attribute
            bonus = node_def.effect_per_level * alloc.current_level
            if tower not in modifiers:
                modifiers[tower] = {}
            modifiers[tower][attr] = modifiers[tower].get(attr, 0) + bonus
        return modifiers

    def allocate_point(self, user_id: str, talent_node_id: str) -> dict:
        node_def = TALENT_NODE_DEFS.get(talent_node_id)
        if not node_def:
            raise TalentNodeNotFoundError(f"Unknown talent node: {talent_node_id}")

        with self._uow:
            alloc_list = self._talent_repo.find_by_user_for_update(user_id)
            earned = self._achievement_repo.sum_talent_points(user_id)
            spent = self._calculate_spent_points(alloc_list)
            available = earned - spent

            if available < node_def.cost_per_level:
                raise InsufficientTalentPointsError(
                    f"Need {node_def.cost_per_level} points, have {available}"
                )

            existing = self._talent_repo.find_by_user_and_node(user_id, talent_node_id)
            current_level = existing.current_level if existing else 0

            if current_level >= node_def.max_level:
                raise MaxLevelReachedError(
                    f"Node {talent_node_id} already at max level {node_def.max_level}"
                )

            allocations = {a.talent_node_id: a.current_level for a in alloc_list}
            for prereq_id in node_def.prerequisites:
                prereq_def = TALENT_NODE_DEFS.get(prereq_id)
                if not prereq_def:
                    continue
                if allocations.get(prereq_id, 0) < 1:
                    raise PrerequisiteNotMetError(
                        f"Prerequisite not met: {prereq_def.name}"
                    )

            if existing:
                existing.upgrade()
                self._talent_repo.save(existing)
            else:
                alloc = TalentAllocation.create(user_id, talent_node_id)
                self._talent_repo.save(alloc)

            self._uow.commit()

        return self.get_tree(user_id)

    def reset_tree(self, user_id: str) -> dict:
        with self._uow:
            self._talent_repo.delete_by_user(user_id)
            self._uow.commit()
            logger.info("Talent tree reset: user=%s", user_id)
        return self.get_tree(user_id)
