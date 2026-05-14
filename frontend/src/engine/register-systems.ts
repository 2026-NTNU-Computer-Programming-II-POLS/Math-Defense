/**
 * register-systems — pure engine bootstrap (F-ARCH-5).
 *
 * Adds the canonical V2 system list to a Game instance in the order the
 * combat/movement/render pipeline expects. Lives in `engine/` (not
 * `composables/`) so the engine layer owns its own composition root and is
 * importable from any host (Vue UI, headless tests, replay tooling) without
 * pulling Pinia or component-tree concerns.
 *
 * Two callbacks are injected because their data sources sit outside the
 * engine layer:
 *   - getSelectedTowerType / clearSelectedTowerType  → uiStore selection
 *   - setLeadEnemyX                                  → gameStore path-panel mirror
 *
 * Renderer registration intentionally stays here (alongside systems) because
 * Game treats them uniformly through addSystem; splitting them would just
 * fragment the registration pass without isolating any concern.
 */
import { BuffSystem } from '@/systems/BuffSystem'
import { WaveSystem } from '@/systems/WaveSystem'
import { MovementSystem } from '@/systems/MovementSystem'
import { CombatSystem } from '@/systems/CombatSystem'
import { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import { EconomySystem } from '@/systems/EconomySystem'
import { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import { TowerInterferenceSystem } from '@/systems/TowerInterferenceSystem'
import { RadarTowerSystem } from '@/systems/RadarTowerSystem'
import { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import { CalculusTowerSystem } from '@/systems/CalculusTowerSystem'
import { PetCombatSystem } from '@/systems/PetCombatSystem'
import { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import { EnemyAbilitySystem } from '@/systems/EnemyAbilitySystem'
import { SpellSystem } from '@/systems/SpellSystem'
import { MontyHallSystem } from '@/systems/MontyHallSystem'
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import { MagicZoneRenderer } from '@/renderers/MagicZoneRenderer'
import { RadarRangeRenderer } from '@/renderers/RadarRangeRenderer'
import { MatrixLaserRenderer } from '@/renderers/MatrixLaserRenderer'
import { PetRenderer } from '@/renderers/PetRenderer'
import { SpellEffectRenderer } from '@/renderers/SpellEffectRenderer'
import { CombatFeedbackRenderer } from '@/renderers/CombatFeedbackRenderer'
import type { Game, GameSystem } from '@/engine/Game'
import type { TowerType } from '@/data/constants'

export interface RegisterSystemsOptions {
  /** uiStore.selectedTowerType — read on every placement attempt. */
  getSelectedTowerType: () => TowerType | null
  /** uiStore.clearSelectedTower — fired after a successful placement. */
  clearSelectedTowerType: () => void
  /** gameStore.setLeadEnemyX — fed each frame by MovementSystem. */
  setLeadEnemyX: (x: number) => void
}

export function registerSystems(game: Game, opts: RegisterSystemsOptions): void {
  const placement = new TowerPlacementSystem()
  placement.getSelectedTowerType = opts.getSelectedTowerType
  placement.clearSelectedTowerType = opts.clearSelectedTowerType

  const movement = new MovementSystem()
  movement.setLeadEnemyX = opts.setLeadEnemyX

  const systems: [string, GameSystem][] = [
    ['placement', placement],
    ['enemyAbility', new EnemyAbilitySystem()],
    ['combat', new CombatSystem()],
    ['movement', movement],
    ['wave', new WaveSystem()],
    ['buff', new BuffSystem()],
    ['economy', new EconomySystem()],
    // TowerInterferenceSystem MUST precede magicTower: it sets each tower's
    // interferenceFactor for the frame before MagicTowerSystem folds in the
    // magic buff (Phase 7 §7.3 ordering dependency).
    ['towerInterference', new TowerInterferenceSystem()],
    ['magicTower', new MagicTowerSystem()],
    ['radarTower', new RadarTowerSystem()],
    ['matrixTower', new MatrixTowerSystem()],
    ['limitTower', new LimitTowerSystem()],
    ['calculusTower', new CalculusTowerSystem()],
    ['petCombat', new PetCombatSystem()],
    ['towerUpgrade', new TowerUpgradeSystem()],
    ['spell', new SpellSystem()],
    ['montyHall', new MontyHallSystem()],
    ['enemyRenderer', new EnemyRenderer()],
    ['towerRenderer', new TowerRenderer()],
    ['projectileRenderer', new ProjectileRenderer()],
    ['magicZoneRenderer', new MagicZoneRenderer()],
    ['radarRangeRenderer', new RadarRangeRenderer()],
    ['matrixLaserRenderer', new MatrixLaserRenderer()],
    ['petRenderer', new PetRenderer()],
    ['spellEffectRenderer', new SpellEffectRenderer()],
    ['combatFeedbackRenderer', new CombatFeedbackRenderer()],
  ]
  for (const [name, sys] of systems) game.addSystem(name, sys)
}
