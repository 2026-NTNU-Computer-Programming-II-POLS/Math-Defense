/**
 * principle-defs — pedagogical principle catalogue (Backlog item #1).
 *
 * Each entry maps an in-game moment (a tower archetype the player just
 * exercised, or an event like Chain Rule resolution) to the underlying
 * mathematical principle, a KaTeX formula, and a one-paragraph plain-language
 * gloss. Used by `PrincipleOverlay.vue` to surface a dismissible card after
 * waves, chain-rule resolutions, and Monty Hall results.
 */

export type PrincipleId =
  | 'chain-rule'
  | 'monty-hall'
  | 'derivative-as-rate'
  | 'limit-piecewise'
  | 'matrix-dot'
  | 'magic-curve-zone'
  | 'radar-arc'

export interface PrincipleDef {
  readonly id: PrincipleId
  readonly title: string
  readonly latex: string
  readonly prose: string
}

export const PRINCIPLE_DEFS: Readonly<Record<PrincipleId, PrincipleDef>> = Object.freeze({
  'chain-rule': {
    id: 'chain-rule',
    title: 'Chain Rule',
    latex: '(f \\circ g)\'(x) = f\'(g(x)) \\cdot g\'(x)',
    prose: 'When one function is composed inside another, the rate of change of the whole is the outside rate evaluated at the inside, multiplied by the inside rate. The boss split because you applied this decomposition.',
  },
  'monty-hall': {
    id: 'monty-hall',
    title: 'Conditional Probability — Switching Wins',
    latex: 'P(\\text{win} \\mid \\text{switch}) = \\tfrac{2}{3} > \\tfrac{1}{3} = P(\\text{win} \\mid \\text{stay})',
    prose: 'After a losing door is revealed, the remaining unchosen door inherits the probability mass of every door you did not pick. Switching is therefore twice as good as staying — counter-intuitive, but provable.',
  },
  'derivative-as-rate': {
    id: 'derivative-as-rate',
    title: 'Derivative as Instantaneous Rate',
    latex: 'f\'(x) = \\lim_{h \\to 0} \\dfrac{f(x+h) - f(x)}{h}',
    prose: 'A Calculus pet differentiates the curve under it: it is reading off how fast the function is changing at that point. The integral pet does the inverse — accumulating signed area.',
  },
  'limit-piecewise': {
    id: 'limit-piecewise',
    title: 'One-Sided Limits on Piecewise Paths',
    latex: '\\lim_{x \\to c^-} f(x) \\;\\ne\\; \\lim_{x \\to c^+} f(x) \\Rightarrow \\text{limit DNE}',
    prose: 'Where two segments meet, the left and right limits can disagree. The Limit tower fires when you correctly identify whether the limit exists, is infinite, or differs by side.',
  },
  'matrix-dot': {
    id: 'matrix-dot',
    title: 'Matrix Pair as Dot Product',
    latex: '\\langle u, v \\rangle = \\sum_i u_i v_i',
    prose: 'A Matrix tower fires its laser along the line whose direction is the dot product of its paired vectors. Pairing rotates the firing axis without moving the tower.',
  },
  'magic-curve-zone': {
    id: 'magic-curve-zone',
    title: 'Function Curve as Damage Zone',
    latex: 'y = f(x) \\Rightarrow \\text{zone} = \\{(x, y) : |y - f(x)| < \\varepsilon\\}',
    prose: 'A Magic tower paints a band along its chosen curve. Enemies inside that band take damage every tick, so the right curve choice is the one that hugs the path the enemies will walk.',
  },
  'radar-arc': {
    id: 'radar-arc',
    title: 'Arc Restriction by Angular Range',
    latex: '\\theta \\in [\\theta_{\\text{start}}, \\theta_{\\text{end}}] \\subset [0, 2\\pi)',
    prose: 'A Radar tower restricts its firing arc to a slice of the unit circle. Narrower arcs concentrate damage; wider arcs cover more lanes. Choose by where the path bends.',
  },
})

/**
 * All registered principle ids. Useful for tests and iteration.
 */
export const PRINCIPLE_IDS: ReadonlyArray<PrincipleId> = Object.freeze(
  Object.keys(PRINCIPLE_DEFS) as PrincipleId[],
)

import type { TowerType } from '@/data/constants'

/**
 * Map a tower type to the principle it most directly exercises. Used by the
 * post-wave selector to translate "dominant tower used this wave" into a
 * principle id.
 */
export const TOWER_TO_PRINCIPLE: Readonly<Record<TowerType, PrincipleId>> = Object.freeze({
  magic:    'magic-curve-zone',
  radarA:   'radar-arc',
  radarB:   'radar-arc',
  radarC:   'radar-arc',
  matrix:   'matrix-dot',
  limit:    'limit-piecewise',
  calculus: 'derivative-as-rate',
})
