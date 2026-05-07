/**
 * Lint tests for ACHIEVEMENT_DEFS — Pedagogical_Backlog_Spec.md §13.
 *
 * Hattie & Timperley (2007): feedback should target task/process level, not
 * the trait level. Names and descriptions must avoid praise adjectives so the
 * toast renders "you did X" rather than "you are a Genius".
 */
import { describe, it, expect } from 'vitest'
import { ACHIEVEMENT_DEFS } from './achievement-defs'

const BANNED_WORDS = ['Master', 'Legendary', 'Genius', 'Amazing']

describe('ACHIEVEMENT_DEFS', () => {
  it('test_no_trait_praise: no name or description contains banned trait-praise words', () => {
    const offenders: string[] = []
    for (const def of Object.values(ACHIEVEMENT_DEFS)) {
      for (const word of BANNED_WORDS) {
        const re = new RegExp(`\\b${word}\\b`, 'i')
        if (re.test(def.name)) offenders.push(`${def.id}.name="${def.name}" contains "${word}"`)
        if (re.test(def.description)) offenders.push(`${def.id}.description="${def.description}" contains "${word}"`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('every description starts with an action verb (task/process-level feedback)', () => {
    const allowedVerbs = /^(Kill|Achieve|Score|Complete|Survive|Hold|Play|Unlock|Clear)\b/
    for (const def of Object.values(ACHIEVEMENT_DEFS)) {
      expect(def.description, `${def.id} description should begin with an action verb`).toMatch(allowedVerbs)
    }
  })
})
