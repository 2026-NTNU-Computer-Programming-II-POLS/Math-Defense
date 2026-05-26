/**
 * counter-enemy-info — single source of truth for the per-enemy explanation
 * copy shared by the Phase 6 telegraph layers:
 *   - the BUILD-phase pre-wave warning (WaveForecast.vue, §6.1)
 *   - the one-time first-encounter card (FirstEncounterCard.vue, §6.2)
 *
 * Presentation data only — lives in `data/` so both a component and a
 * composable can read it without crossing a layer boundary.
 */
import { EnemyType } from './constants'

export interface CounterEnemyInfo {
  /** Display name. */
  readonly name: string
  /** The tower that answers this enemy. */
  readonly counterTower: string
  /** One-line BUILD-phase forecast warning. */
  readonly warning: string
  /** Longer first-encounter explanation: what it does, why simple towers
   *  struggle, and which tower is the answer. */
  readonly explanation: string
}

/**
 * Only the three V3 counter-enemies have entries. The presence of a key here
 * is also what defines "is a counter-enemy" — see {@link isCounterEnemy}.
 */
export const COUNTER_ENEMY_INFO: Partial<Record<EnemyType, CounterEnemyInfo>> = {
  [EnemyType.REGENERATOR]: {
    name: 'Regenerator',
    counterTower: 'Limit tower',
    warning: "sustained damage can't out-heal it — needs an instant kill (Limit tower, +∞).",
    explanation:
      'The Regenerator heals itself every second. A steady trickle of damage from '
      + 'ordinary towers is simply out-healed — its HP bar refills faster than you '
      + 'can chip it down. The Limit tower is the answer: a correctly evaluated '
      + 'limit of +∞ lands an instant, uncapped kill that regeneration cannot undo.',
  },
  [EnemyType.BULWARK]: {
    name: 'Bulwark',
    counterTower: 'Matrix tower',
    warning: 'tower damage is reduced 60% — bypass with Calculus pets or the Matrix laser ramp.',
    explanation:
      'The Bulwark only takes 40% of any tower damage, so heavy slow-firing '
      + 'shots feel weak. Pets and player-cast effects bypass the reduction '
      + 'entirely; the Matrix tower’s ramping laser is the next-best '
      + 'option because its sustained damage stacks fast enough to grind '
      + 'through even after the multiplier.',
  },
  [EnemyType.SWARMLING]: {
    name: 'Swarmling',
    counterTower: 'Calculus tower',
    warning: 'towers hit them weakly — needs autonomous pets (Calculus).',
    explanation:
      'Swarmlings arrive in tight bursts and shrug off ordinary tower fire — each '
      + 'one barely takes damage from a direct hit. The Calculus tower answers '
      + 'them: it spawns autonomous pets that chase the swarm down and clear them '
      + 'one by one without tying up the rest of your defenses.',
  },
}

/** True when `type` is one of the three V3 counter-enemies. */
export function isCounterEnemy(type: EnemyType): boolean {
  return type in COUNTER_ENEMY_INFO
}
