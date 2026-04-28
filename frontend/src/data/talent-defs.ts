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
}

export const TALENT_NODE_DEFS: Record<string, TalentNodeDef> = {
  // Magic Tower
  magic_zone_strength: { id: 'magic_zone_strength', towerType: TowerType.MAGIC, attribute: 'zone_strength', name: 'Zone Power', description: 'Increase zone effect strength', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  magic_zone_width:    { id: 'magic_zone_width', towerType: TowerType.MAGIC, attribute: 'zone_width', name: 'Wide Zones', description: 'Increase zone width', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.08, prerequisites: ['magic_zone_strength'] },
  magic_duration:      { id: 'magic_duration', towerType: TowerType.MAGIC, attribute: 'duration', name: 'Lasting Effects', description: 'Increase zone duration', maxLevel: 2, costPerLevel: 2, effectPerLevel: 0.15, prerequisites: ['magic_zone_strength'] },

  // Radar A
  radar_a_range:       { id: 'radar_a_range', towerType: TowerType.RADAR_A, attribute: 'range', name: 'Sweep Range', description: 'Increase AoE range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  radar_a_speed:       { id: 'radar_a_speed', towerType: TowerType.RADAR_A, attribute: 'sweep_speed', name: 'Sweep Speed', description: 'Increase sweep speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: ['radar_a_range'] },

  // Radar B
  radar_b_speed:       { id: 'radar_b_speed', towerType: TowerType.RADAR_B, attribute: 'attack_speed', name: 'Rapid Fire', description: 'Increase attack speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  radar_b_damage:      { id: 'radar_b_damage', towerType: TowerType.RADAR_B, attribute: 'damage', name: 'Piercing Shots', description: 'Increase damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.08, prerequisites: ['radar_b_speed'] },
  radar_b_targets:     { id: 'radar_b_targets', towerType: TowerType.RADAR_B, attribute: 'target_count', name: 'Multi-Target', description: 'Hit additional targets', maxLevel: 2, costPerLevel: 2, effectPerLevel: 1.0, prerequisites: ['radar_b_damage'] },

  // Radar C
  radar_c_damage:      { id: 'radar_c_damage', towerType: TowerType.RADAR_C, attribute: 'damage', name: 'Heavy Rounds', description: 'Increase damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: [] },
  radar_c_range:       { id: 'radar_c_range', towerType: TowerType.RADAR_C, attribute: 'range', name: 'Long Barrel', description: 'Increase range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['radar_c_damage'] },
  radar_c_targets:     { id: 'radar_c_targets', towerType: TowerType.RADAR_C, attribute: 'target_count', name: 'Split Shot', description: 'Hit additional targets', maxLevel: 2, costPerLevel: 2, effectPerLevel: 1.0, prerequisites: ['radar_c_damage'] },

  // Matrix Tower
  matrix_range:        { id: 'matrix_range', towerType: TowerType.MATRIX, attribute: 'range', name: 'Field Range', description: 'Increase matrix range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  matrix_targets:      { id: 'matrix_targets', towerType: TowerType.MATRIX, attribute: 'target_count', name: 'Multi-Lock', description: 'Lock additional targets', maxLevel: 2, costPerLevel: 2, effectPerLevel: 1.0, prerequisites: ['matrix_range'] },
  matrix_ramp:         { id: 'matrix_ramp', towerType: TowerType.MATRIX, attribute: 'damage_ramp', name: 'Damage Ramp', description: 'Increase damage ramp rate', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.15, prerequisites: ['matrix_range'] },

  // Limit Tower
  limit_damage:        { id: 'limit_damage', towerType: TowerType.LIMIT, attribute: 'damage', name: 'Limit Break', description: 'Increase damage multiplier', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.12, prerequisites: [] },
  limit_range:         { id: 'limit_range', towerType: TowerType.LIMIT, attribute: 'range', name: 'Extended Limit', description: 'Increase range', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['limit_damage'] },

  // Calculus Tower
  calculus_pet_speed:  { id: 'calculus_pet_speed', towerType: TowerType.CALCULUS, attribute: 'pet_attack_speed', name: 'Quick Pets', description: 'Increase pet attack speed', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: [] },
  calculus_pet_damage: { id: 'calculus_pet_damage', towerType: TowerType.CALCULUS, attribute: 'pet_damage', name: 'Strong Pets', description: 'Increase pet damage', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.10, prerequisites: ['calculus_pet_speed'] },
  calculus_pet_hp:     { id: 'calculus_pet_hp', towerType: TowerType.CALCULUS, attribute: 'pet_hp', name: 'Tough Pets', description: 'Increase pet HP', maxLevel: 3, costPerLevel: 1, effectPerLevel: 0.15, prerequisites: ['calculus_pet_speed'] },
}

export function getNodesByTower(towerType: TowerType): TalentNodeDef[] {
  return Object.values(TALENT_NODE_DEFS).filter(n => n.towerType === towerType)
}
