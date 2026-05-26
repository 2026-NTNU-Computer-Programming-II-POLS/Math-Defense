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
    # Phase 7 (Q14): advanced "tier-2" nodes require their parent at the
    # parent's max_level (not just level >= 1). The id of each entry is
    # resolved against TALENT_NODE_DEFS at allocation time and the user's
    # current level on that node must equal that node's max_level.
    prerequisite_max_levels: tuple[str, ...] = ()


TALENT_NODE_DEFS: dict[str, TalentNodeDef] = {}


def _reg(n: TalentNodeDef) -> None:
    TALENT_NODE_DEFS[n.id] = n


# ── Magic Tower ──
_reg(TalentNodeDef("magic_zone_strength", "magic", "zone_strength", "Zone Power", "Increase zone effect strength", 3, 1, 0.10))
_reg(TalentNodeDef("magic_zone_width", "magic", "zone_width", "Wide Zones", "Increase zone width", 3, 1, 0.08, ("magic_zone_strength",)))
_reg(TalentNodeDef("magic_duration", "magic", "duration", "Lasting Effects", "Increase zone duration", 2, 3, 0.15, ("magic_zone_strength",)))

# ── Radar A — Sweep ──
_reg(TalentNodeDef("radar_a_range", "radarA", "range", "Sweep Range", "Increase AoE range", 3, 1, 0.10))
_reg(TalentNodeDef("radar_a_speed", "radarA", "sweep_speed", "Sweep Speed", "Increase sweep speed", 3, 1, 0.12, ("radar_a_range",)))

# ── Radar B — Rapid ──
_reg(TalentNodeDef("radar_b_speed", "radarB", "attack_speed", "Rapid Fire", "Increase attack speed", 3, 1, 0.10))
_reg(TalentNodeDef("radar_b_damage", "radarB", "damage", "Piercing Shots", "Increase damage", 3, 1, 0.08, ("radar_b_speed",)))
_reg(TalentNodeDef("radar_b_targets", "radarB", "target_count", "Multi-Target", "Hit additional targets", 2, 3, 1.0, ("radar_b_damage",)))

# ── Radar C — Sniper ──
_reg(TalentNodeDef("radar_c_damage", "radarC", "damage", "Heavy Rounds", "Increase damage", 3, 1, 0.12))
_reg(TalentNodeDef("radar_c_range", "radarC", "range", "Long Barrel", "Increase range", 3, 1, 0.10, ("radar_c_damage",)))
_reg(TalentNodeDef("radar_c_targets", "radarC", "target_count", "Split Shot", "Hit additional targets", 2, 3, 1.0, ("radar_c_damage",)))

# ── Matrix Tower ──
_reg(TalentNodeDef("matrix_range", "matrix", "range", "Field Range", "Increase matrix range", 3, 1, 0.10))
_reg(TalentNodeDef("matrix_targets", "matrix", "target_count", "Multi-Lock", "Lock additional targets", 2, 3, 1.0, ("matrix_range",)))
_reg(TalentNodeDef("matrix_ramp", "matrix", "damage_ramp", "Damage Ramp", "Increase damage ramp rate", 3, 1, 0.15, ("matrix_range",)))

# ── Limit Tower ──
_reg(TalentNodeDef("limit_damage", "limit", "damage", "Limit Break", "Increase damage multiplier", 3, 1, 0.12))
_reg(TalentNodeDef("limit_range", "limit", "range", "Extended Limit", "Increase range", 3, 1, 0.10, ("limit_damage",)))

# ── Calculus Tower ──
_reg(TalentNodeDef("calculus_pet_speed", "calculus", "pet_attack_speed", "Quick Pets", "Increase pet attack speed", 3, 1, 0.10))
_reg(TalentNodeDef("calculus_pet_damage", "calculus", "pet_damage", "Strong Pets", "Increase pet damage", 3, 1, 0.10, ("calculus_pet_speed",)))
_reg(TalentNodeDef("calculus_pet_range", "calculus", "pet_range", "Extended Reach", "Increase pet attack range", 3, 1, 0.20, ("calculus_pet_speed",)))

# ── Advanced "tier-2" nodes (Phase 7 / Q14) ──
# Each requires its parent at max level. Sized at 2 lv × 3 TP = 6 TP/tower,
# 42 TP total — comfortably exceeds the 55 TP achievement pool so a fully-
# achievement-loaded player can still aspire to one more node.
_reg(TalentNodeDef("magic_slow_strength", "magic", "slow_strength", "Deeper Chill",
                   "Magic debuff slow is stronger (subtracts from the slow factor)",
                   2, 3, 0.10, (), ("magic_zone_width",)))
_reg(TalentNodeDef("radar_a_aoe_width", "radarA", "aoe_width", "Wider Sweep",
                   "Sweep beam covers a wider arc",
                   2, 3, 0.10, (), ("radar_a_speed",)))
_reg(TalentNodeDef("radar_b_crit_chance", "radarB", "crit_chance", "Lucky Shots",
                   "Chance to crit for 2× damage",
                   2, 3, 0.10, (), ("radar_b_targets",)))
_reg(TalentNodeDef("radar_c_crit_damage", "radarC", "crit_damage", "Devastating Crits",
                   "Crit damage bonus (adds to the 2× base multiplier)",
                   2, 3, 0.50, (), ("radar_c_targets",)))
_reg(TalentNodeDef("matrix_resonance", "matrix", "resonance", "Pair Resonance",
                   "Paired-tower base damage multiplied by (1 + resonance)",
                   2, 3, 0.15, (), ("matrix_ramp",)))
_reg(TalentNodeDef("limit_burst_bonus", "limit", "burst_bonus", "Greater Burst",
                   "Each burst hits for more (adds to the 1.5× base multiplier)",
                   2, 3, 0.25, (), ("limit_range",)))
_reg(TalentNodeDef("calculus_pet_crit", "calculus", "pet_crit", "Pet Fervor",
                   "Pet attacks have a chance to crit for 2× damage",
                   2, 3, 0.10, (), ("calculus_pet_damage",)))


def get_all_nodes() -> list[TalentNodeDef]:
    return list(TALENT_NODE_DEFS.values())


def get_nodes_by_tower(tower_type: str) -> list[TalentNodeDef]:
    return [n for n in TALENT_NODE_DEFS.values() if n.tower_type == tower_type]
