import { TowerType } from './constants'

export interface TalentNodeDef {
  id: string
  towerType: TowerType
  attribute: string
  name: string
  description: string
  maxLevel: number
  costPerLevel: number
  effectPerLevel: number
  prerequisites: string[]
  // Phase 7 (Q14): advanced "tier-2" prereqs requiring the parent at its
  // max_level. Optional + defaults to [] so existing nodes stay unchanged.
  prerequisiteMaxLevels?: string[]
}

export const TALENT_NODE_DEFS: Record<string, TalentNodeDef> = {
  // Magic Tower
  magic_zone_strength: { id: 'magic_zone_strength', towerType: TowerType.MAGIC, attribute: 'zone_strength', name: 'Zone Power', description: 'Increase zone effect strength', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  magic_zone_width:    { id: 'magic_zone_width', towerType: TowerType.MAGIC, attribute: 'zone_width', name: 'Wide Zones', description: 'Increase zone width', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.08, prerequisites: ['magic_zone_strength'] },
  magic_duration:      { id: 'magic_duration', towerType: TowerType.MAGIC, attribute: 'duration', name: 'Lasting Effects', description: 'Increase zone duration', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.15, prerequisites: ['magic_zone_strength'] },

  // Radar A
  radar_a_range:       { id: 'radar_a_range', towerType: TowerType.RADAR_A, attribute: 'range', name: 'Sweep Range', description: 'Increase AoE range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  radar_a_speed:       { id: 'radar_a_speed', towerType: TowerType.RADAR_A, attribute: 'sweep_speed', name: 'Sweep Speed', description: 'Increase sweep speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: ['radar_a_range'] },

  // Radar B
  radar_b_speed:       { id: 'radar_b_speed', towerType: TowerType.RADAR_B, attribute: 'attack_speed', name: 'Rapid Fire', description: 'Increase attack speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  radar_b_damage:      { id: 'radar_b_damage', towerType: TowerType.RADAR_B, attribute: 'damage', name: 'Piercing Shots', description: 'Increase damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.08, prerequisites: ['radar_b_speed'] },
  radar_b_targets:     { id: 'radar_b_targets', towerType: TowerType.RADAR_B, attribute: 'target_count', name: 'Multi-Target', description: 'Hit additional targets', maxLevel: 2, costPerLevel: 3, effectPerLevel: 1.0, prerequisites: ['radar_b_damage'] },

  // Radar C
  radar_c_damage:      { id: 'radar_c_damage', towerType: TowerType.RADAR_C, attribute: 'damage', name: 'Heavy Rounds', description: 'Increase damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: [] },
  radar_c_range:       { id: 'radar_c_range', towerType: TowerType.RADAR_C, attribute: 'range', name: 'Long Barrel', description: 'Increase range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['radar_c_damage'] },
  radar_c_targets:     { id: 'radar_c_targets', towerType: TowerType.RADAR_C, attribute: 'target_count', name: 'Split Shot', description: 'Hit additional targets', maxLevel: 2, costPerLevel: 3, effectPerLevel: 1.0, prerequisites: ['radar_c_damage'] },

  // Matrix Tower
  matrix_range:        { id: 'matrix_range', towerType: TowerType.MATRIX, attribute: 'range', name: 'Field Range', description: 'Increase matrix range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  matrix_targets:      { id: 'matrix_targets', towerType: TowerType.MATRIX, attribute: 'target_count', name: 'Multi-Lock', description: 'Lock additional targets', maxLevel: 2, costPerLevel: 3, effectPerLevel: 1.0, prerequisites: ['matrix_range'] },
  matrix_ramp:         { id: 'matrix_ramp', towerType: TowerType.MATRIX, attribute: 'damage_ramp', name: 'Damage Ramp', description: 'Increase damage ramp rate', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.15, prerequisites: ['matrix_range'] },

  // Limit Tower
  limit_damage:        { id: 'limit_damage', towerType: TowerType.LIMIT, attribute: 'damage', name: 'Limit Break', description: 'Increase damage multiplier', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: [] },
  limit_range:         { id: 'limit_range', towerType: TowerType.LIMIT, attribute: 'range', name: 'Extended Limit', description: 'Increase range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['limit_damage'] },

  // Calculus Tower
  calculus_pet_speed:  { id: 'calculus_pet_speed', towerType: TowerType.CALCULUS, attribute: 'pet_attack_speed', name: 'Quick Pets', description: 'Increase pet attack speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  calculus_pet_damage: { id: 'calculus_pet_damage', towerType: TowerType.CALCULUS, attribute: 'pet_damage', name: 'Strong Pets', description: 'Increase pet damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['calculus_pet_speed'] },
  calculus_pet_range:  { id: 'calculus_pet_range', towerType: TowerType.CALCULUS, attribute: 'pet_range', name: 'Extended Reach', description: 'Increase pet attack range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.20, prerequisites: ['calculus_pet_speed'] },

  // Phase 7 (Q14) — advanced "tier-2" nodes. Each requires its parent at
  // max level; sized at 2 lv × 3 TP = 6 TP per tower (42 TP total) so the
  // 52 TP achievement pool still leaves headroom to specialize.
  magic_slow_strength:  { id: 'magic_slow_strength', towerType: TowerType.MAGIC, attribute: 'slow_strength', name: 'Deeper Chill', description: 'Magic debuff slow is stronger', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.10, prerequisites: [], prerequisiteMaxLevels: ['magic_zone_width'] },
  radar_a_aoe_width:    { id: 'radar_a_aoe_width', towerType: TowerType.RADAR_A, attribute: 'aoe_width', name: 'Wider Sweep', description: 'Sweep beam covers a wider arc', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.10, prerequisites: [], prerequisiteMaxLevels: ['radar_a_speed'] },
  radar_b_crit_chance:  { id: 'radar_b_crit_chance', towerType: TowerType.RADAR_B, attribute: 'crit_chance', name: 'Lucky Shots', description: 'Chance to crit for 2× damage', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.10, prerequisites: [], prerequisiteMaxLevels: ['radar_b_targets'] },
  radar_c_crit_damage:  { id: 'radar_c_crit_damage', towerType: TowerType.RADAR_C, attribute: 'crit_damage', name: 'Devastating Crits', description: 'Crit damage bonus (adds to the 2× base multiplier)', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.50, prerequisites: [], prerequisiteMaxLevels: ['radar_c_targets'] },
  matrix_resonance:     { id: 'matrix_resonance', towerType: TowerType.MATRIX, attribute: 'resonance', name: 'Pair Resonance', description: 'Paired-tower base damage multiplied by (1 + resonance)', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.15, prerequisites: [], prerequisiteMaxLevels: ['matrix_ramp'] },
  limit_burst_bonus:    { id: 'limit_burst_bonus', towerType: TowerType.LIMIT, attribute: 'burst_bonus', name: 'Greater Burst', description: 'Each burst hits for more (adds to the 1.5× base multiplier)', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.25, prerequisites: [], prerequisiteMaxLevels: ['limit_range'] },
  calculus_pet_crit:    { id: 'calculus_pet_crit', towerType: TowerType.CALCULUS, attribute: 'pet_crit', name: 'Pet Fervor', description: 'Pet attacks have a chance to crit for 2× damage', maxLevel: 2, costPerLevel: 3, effectPerLevel: 0.10, prerequisites: [], prerequisiteMaxLevels: ['calculus_pet_damage'] },
}

export function getNodesByTower(towerType: TowerType): TalentNodeDef[] {
  return Object.values(TALENT_NODE_DEFS).filter(n => n.towerType === towerType)
}
