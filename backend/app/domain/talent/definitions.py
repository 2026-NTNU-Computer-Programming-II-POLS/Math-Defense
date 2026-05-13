"""Talent tree definitions — single source of truth for talent nodes.

Each talent node upgrades a specific tower attribute permanently across sessions.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TalentNodeDef:
    id: str
    tower_type: str
    attribute: str
    name: str
    description: str
    max_level: int
    cost_per_level: int
    effect_per_level: float
    prerequisites: tuple[str, ...] = ()


TALENT_NODE_DEFS: dict[str, TalentNodeDef] = {}


def _reg(n: TalentNodeDef) -> None:
    TALENT_NODE_DEFS[n.id] = n


# ── Magic Tower ──
_reg(TalentNodeDef("magic_zone_strength", "magic", "zone_strength", "Zone Power", "Increase zone effect strength", 3, 1, 0.10))
_reg(TalentNodeDef("magic_zone_width", "magic", "zone_width", "Wide Zones", "Increase zone width", 3, 1, 0.08, ("magic_zone_strength",)))
_reg(TalentNodeDef("magic_duration", "magic", "duration", "Lasting Effects", "Increase zone duration", 2, 2, 0.15, ("magic_zone_strength",)))

# ── Radar A — Sweep ──
_reg(TalentNodeDef("radar_a_range", "radarA", "range", "Sweep Range", "Increase AoE range", 3, 1, 0.10))
_reg(TalentNodeDef("radar_a_speed", "radarA", "sweep_speed", "Sweep Speed", "Increase sweep speed", 3, 1, 0.12, ("radar_a_range",)))

# ── Radar B — Rapid ──
_reg(TalentNodeDef("radar_b_speed", "radarB", "attack_speed", "Rapid Fire", "Increase attack speed", 3, 1, 0.10))
_reg(TalentNodeDef("radar_b_damage", "radarB", "damage", "Piercing Shots", "Increase damage", 3, 1, 0.08, ("radar_b_speed",)))
_reg(TalentNodeDef("radar_b_targets", "radarB", "target_count", "Multi-Target", "Hit additional targets", 2, 2, 1.0, ("radar_b_damage",)))

# ── Radar C — Sniper ──
_reg(TalentNodeDef("radar_c_damage", "radarC", "damage", "Heavy Rounds", "Increase damage", 3, 1, 0.12))
_reg(TalentNodeDef("radar_c_range", "radarC", "range", "Long Barrel", "Increase range", 3, 1, 0.10, ("radar_c_damage",)))
_reg(TalentNodeDef("radar_c_targets", "radarC", "target_count", "Split Shot", "Hit additional targets", 2, 2, 1.0, ("radar_c_damage",)))

# ── Matrix Tower ──
_reg(TalentNodeDef("matrix_range", "matrix", "range", "Field Range", "Increase matrix range", 3, 1, 0.10))
_reg(TalentNodeDef("matrix_targets", "matrix", "target_count", "Multi-Lock", "Lock additional targets", 2, 2, 1.0, ("matrix_range",)))
_reg(TalentNodeDef("matrix_ramp", "matrix", "damage_ramp", "Damage Ramp", "Increase damage ramp rate", 3, 1, 0.15, ("matrix_range",)))

# ── Limit Tower ──
_reg(TalentNodeDef("limit_damage", "limit", "damage", "Limit Break", "Increase damage multiplier", 3, 1, 0.12))
_reg(TalentNodeDef("limit_range", "limit", "range", "Extended Limit", "Increase range", 3, 1, 0.10, ("limit_damage",)))

# ── Calculus Tower ──
_reg(TalentNodeDef("calculus_pet_speed", "calculus", "pet_attack_speed", "Quick Pets", "Increase pet attack speed", 3, 1, 0.10))
_reg(TalentNodeDef("calculus_pet_damage", "calculus", "pet_damage", "Strong Pets", "Increase pet damage", 3, 1, 0.10, ("calculus_pet_speed",)))
_reg(TalentNodeDef("calculus_pet_hp", "calculus", "pet_hp", "Tough Pets", "Increase pet HP", 3, 1, 0.15, ("calculus_pet_speed",)))


def get_all_nodes() -> list[TalentNodeDef]:
    return list(TALENT_NODE_DEFS.values())


def get_nodes_by_tower(tower_type: str) -> list[TalentNodeDef]:
    return [n for n in TALENT_NODE_DEFS.values() if n.tower_type == tower_type]
