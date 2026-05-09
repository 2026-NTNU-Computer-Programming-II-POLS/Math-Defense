"""TalentApplicationService — allocate, reset, and query talent points"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.talent.definitions import TALENT_NODE_DEFS, get_all_nodes
from app.domain.talent.tree import TalentTree

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.achievement.repository import AchievementRepository
    from app.domain.talent.repository import TalentRepository

logger = logging.getLogger(__name__)


class TalentApplicationService:
    def __init__(
        self,
        talent_repo: TalentRepository,
        achievement_repo: AchievementRepository,
        uow: UnitOfWork,
    ) -> None:
        self._talent_repo = talent_repo
        self._achievement_repo = achievement_repo
        self._uow = uow

    def _load_tree(self, user_id: str, alloc_list) -> TalentTree:
        earned = self._achievement_repo.sum_talent_points(user_id)
        return TalentTree(user_id, alloc_list, earned)

    def get_tree(self, user_id: str) -> dict:
        alloc_list = self._talent_repo.find_by_user(user_id)
        tree = self._load_tree(user_id, alloc_list)
        allocations = {a.talent_node_id: a.current_level for a in alloc_list}

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
            "points_earned": tree.points_earned,
            "points_spent": tree.points_spent,
            "points_available": tree.points_available,
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
        # Cheap pre-check before acquiring the row lock — an unknown node id
        # should fail fast without holding a transaction-scoped lock.
        from app.domain.errors import TalentNodeNotFoundError
        if talent_node_id not in TALENT_NODE_DEFS:
            raise TalentNodeNotFoundError(f"Unknown talent node: {talent_node_id}")
        with self._uow:
            # B-BUG-2: anchor the lock on the user row before reading any
            # allocations. find_by_user_for_update locks zero rows when the
            # user has no prior allocations, leaving the budget check open
            # to a concurrent overspend.
            self._talent_repo.acquire_user_lock(user_id)
            alloc_list = self._talent_repo.find_by_user_for_update(user_id)
            tree = self._load_tree(user_id, alloc_list)
            outcome = tree.allocate(talent_node_id)
            if outcome.upgraded is not None:
                self._talent_repo.save(outcome.upgraded)
            if outcome.created is not None:
                self._talent_repo.save(outcome.created)
            self._uow.commit()

        return self.get_tree(user_id)

    def reset_tree(self, user_id: str) -> dict:
        with self._uow:
            self._talent_repo.delete_by_user(user_id)
            self._uow.commit()
            logger.info("Talent tree reset: user=%s", user_id)
        return self.get_tree(user_id)
