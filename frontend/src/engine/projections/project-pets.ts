/**
 * Per-frame projection of Game.pets into a PetSceneView (F-ARCH-4).
 * PetRenderer consumes the snapshot rather than reading pet entity internals.
 * Returns an empty pet list outside of the WAVE phase so the renderer needs
 * no phase check of its own.
 */
import { GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { PetSceneView, PetView } from './views'

export function projectPetScene(game: Game): PetSceneView {
  if (game.state.phase !== GamePhase.WAVE) return { pets: [] }
  const pets: PetView[] = []
  for (const pet of game.pets) {
    if (!pet.active) continue
    pets.push({
      x: pet.x,
      y: pet.y,
      trait: pet.trait,
      hpRatio: pet.hp < pet.maxHp ? pet.hp / pet.maxHp : null,
    })
  }
  return { pets }
}
