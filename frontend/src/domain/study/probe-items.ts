/**
 * probe-items.ts — Item bank for the Empirical Validity Probe (§27).
 *
 * Three forms (`pre`, `post`, `delay`), 10 items each. Item ids follow the
 * `<form>:<index>` convention so they line up with the server-side answer
 * keys in `backend/app/domain/study/probe_keys.py`.
 *
 * Surface-level facts about the bank:
 *
 * - The `pre` and `post` forms share the same items but with `options`
 *   reordered (Spec §27.3 step 4). Reordering is encoded directly here
 *   so the runner does not have to shuffle at runtime.
 * - The `delay` form contains *new* items that target the same deep
 *   structure (algebra/calculus reasoning) with different surface
 *   features — Barnett & Ceci (2002) far-transfer requirement.
 * - Stems are intentionally compact placeholders for the engineering
 *   enabler (Spec §27.4: probe runs, data exports cleanly). The content
 *   workstream replaces them before the study launches; the runner and
 *   grader contracts do not change.
 */

export type ProbeForm = 'pre' | 'post' | 'delay'

export interface ProbeOption {
  /** Stable label sent back to the server in `selected`. */
  value: string
  /** Display text. */
  text: string
}

export interface ProbeItem {
  id: string
  stem: string
  options: ProbeOption[]
}

const ABCD: readonly string[] = ['A', 'B', 'C', 'D']

function options(values: readonly string[]): ProbeOption[] {
  return values.map((text, i) => ({ value: ABCD[i], text }))
}

export const PROBE_ITEMS: Record<ProbeForm, readonly ProbeItem[]> = {
  pre: [
    {
      id: 'pre:1',
      stem: 'If f(x) = 3x + 2, what is f(4)?',
      options: options(['14', '12', '11', '10']),
    },
    {
      id: 'pre:2',
      stem: 'Solve for x: 2x − 6 = 0',
      options: options(['x = 3', 'x = 6', 'x = 0', 'x = −3']),
    },
    {
      id: 'pre:3',
      stem: 'Which expression equals (x²)\'?',
      options: options(['2x', 'x', 'x²', '2']),
    },
    {
      id: 'pre:4',
      stem: 'limₓ→0 (sin x / x) =',
      options: options(['1', '0', '∞', 'undefined']),
    },
    {
      id: 'pre:5',
      stem: 'The dot product of (1, 2) and (3, 4) is:',
      options: options(['11', '10', '14', '12']),
    },
    {
      id: 'pre:6',
      stem: 'Which is a derivative of cos(x)?',
      options: options(['−sin(x)', 'sin(x)', 'cos(x)', '−cos(x)']),
    },
    {
      id: 'pre:7',
      stem: 'Solve for x: x² = 49 (positive root only)',
      options: options(['7', '49', '14', '−7']),
    },
    {
      id: 'pre:8',
      stem: 'A line with slope 2 passing through (0, 1) has equation:',
      options: options(['y = 2x + 1', 'y = x + 2', 'y = 2x', 'y = x + 1']),
    },
    {
      id: 'pre:9',
      stem: 'Compute: 5! / 3!',
      options: options(['20', '10', '120', '60']),
    },
    {
      id: 'pre:10',
      stem: 'Conditional probability P(A|B) is defined as:',
      options: options(['P(A∩B)/P(B)', 'P(A)·P(B)', 'P(A)+P(B)', 'P(B)/P(A)']),
    },
  ],
  // Same questions as `pre`, options re-ordered so participants cannot
  // pattern-match by position. Item ids and answer keys differ accordingly.
  post: [
    {
      id: 'post:1',
      stem: 'If f(x) = 3x + 2, what is f(4)?',
      options: options(['14', '11', '12', '10']),
    },
    {
      id: 'post:2',
      stem: 'Solve for x: 2x − 6 = 0',
      options: options(['x = 3', 'x = 0', 'x = 6', 'x = −3']),
    },
    {
      id: 'post:3',
      stem: 'Which expression equals (x²)\'?',
      options: options(['2x', 'x²', 'x', '2']),
    },
    {
      id: 'post:4',
      stem: 'limₓ→0 (sin x / x) =',
      options: options(['1', '∞', '0', 'undefined']),
    },
    {
      id: 'post:5',
      stem: 'The dot product of (1, 2) and (3, 4) is:',
      options: options(['11', '14', '10', '12']),
    },
    {
      id: 'post:6',
      stem: 'Which is a derivative of cos(x)?',
      options: options(['−sin(x)', 'cos(x)', 'sin(x)', '−cos(x)']),
    },
    {
      id: 'post:7',
      stem: 'Solve for x: x² = 49 (positive root only)',
      options: options(['7', '14', '49', '−7']),
    },
    {
      id: 'post:8',
      stem: 'A line with slope 2 passing through (0, 1) has equation:',
      options: options(['y = 2x + 1', 'y = 2x', 'y = x + 2', 'y = x + 1']),
    },
    {
      id: 'post:9',
      stem: 'Compute: 5! / 3!',
      options: options(['20', '120', '10', '60']),
    },
    {
      id: 'post:10',
      stem: 'Conditional probability P(A|B) is defined as:',
      options: options(['P(A∩B)/P(B)', 'P(A)+P(B)', 'P(A)·P(B)', 'P(B)/P(A)']),
    },
  ],
  // Far-transfer items: same deep structure, different surface.
  delay: [
    {
      id: 'delay:1',
      stem: 'If g(t) = 5t − 3, what is g(2)?',
      options: options(['7', '8', '10', '13']),
    },
    {
      id: 'delay:2',
      stem: 'Solve for y: 4y + 8 = 0',
      options: options(['y = −2', 'y = 2', 'y = 0', 'y = −8']),
    },
    {
      id: 'delay:3',
      stem: 'd/dx (x³) =',
      options: options(['3x²', 'x²', '3x', 'x³']),
    },
    {
      id: 'delay:4',
      stem: 'limₓ→0 (1 − cos x) / x² =',
      options: options(['1/2', '0', '1', 'undefined']),
    },
    {
      id: 'delay:5',
      stem: 'The dot product of (2, −1) and (3, 4) is:',
      options: options(['2', '5', '11', '−2']),
    },
    {
      id: 'delay:6',
      stem: 'Which is a derivative of sin(x)?',
      options: options(['cos(x)', '−cos(x)', '−sin(x)', 'sin(x)']),
    },
    {
      id: 'delay:7',
      stem: 'Solve for x: x² = 81 (positive root only)',
      options: options(['9', '81', '18', '−9']),
    },
    {
      id: 'delay:8',
      stem: 'A line with slope −1 through (0, 4) has equation:',
      options: options(['y = −x + 4', 'y = x + 4', 'y = −x', 'y = 4 − 4x']),
    },
    {
      id: 'delay:9',
      stem: 'Compute: 6! / 4!',
      options: options(['30', '15', '720', '120']),
    },
    {
      id: 'delay:10',
      stem: 'Bayes\' theorem expresses P(A|B) as:',
      options: options(['P(B|A)·P(A)/P(B)', 'P(A∩B)·P(B)', 'P(A)+P(B)', 'P(A)−P(B)']),
    },
  ],
}

export const PROBE_FORM_LABEL: Record<ProbeForm, string> = {
  pre: 'Pre-test',
  post: 'Post-test',
  delay: 'Delayed transfer',
}

/** Likert items for the affect surveys (Ashcraft 2002 short form, IMI subset). */
export interface LikertItem {
  id: string
  text: string
  subscale: 'anxiety' | 'motivation'
}

export const AFFECT_ITEMS: readonly LikertItem[] = [
  { id: 'anx_1', subscale: 'anxiety', text: 'I feel tense when I think about doing math problems.' },
  { id: 'anx_2', subscale: 'anxiety', text: 'I worry about making mistakes in math.' },
  { id: 'anx_3', subscale: 'anxiety', text: 'I feel nervous during a math test.' },
  { id: 'anx_4', subscale: 'anxiety', text: 'I find math threatening.' },
  { id: 'anx_5', subscale: 'anxiety', text: 'I avoid math when I can.' },
  { id: 'mot_1', subscale: 'motivation', text: 'I find math activities enjoyable.' },
  { id: 'mot_2', subscale: 'motivation', text: 'I would describe math as very interesting.' },
  { id: 'mot_3', subscale: 'motivation', text: 'Doing math holds my attention well.' },
  { id: 'mot_4', subscale: 'motivation', text: 'I would willingly do math practice in my free time.' },
  { id: 'mot_5', subscale: 'motivation', text: 'I feel competent when working through math problems.' },
]

export const LIKERT_ANCHORS: readonly { value: number; text: string }[] = [
  { value: 1, text: 'Strongly disagree' },
  { value: 2, text: 'Disagree' },
  { value: 3, text: 'Neutral' },
  { value: 4, text: 'Agree' },
  { value: 5, text: 'Strongly agree' },
]
