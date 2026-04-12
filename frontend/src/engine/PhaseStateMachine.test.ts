import { describe, it, expect } from 'vitest'
import { PhaseStateMachine } from './PhaseStateMachine'
import { GamePhase } from '@/data/constants'

describe('PhaseStateMachine', () => {
  it('starts in MENU phase', () => {
    const sm = new PhaseStateMachine()
    expect(sm.current).toBe(GamePhase.MENU)
  })

  it('allows valid transitions', () => {
    const sm = new PhaseStateMachine()
    expect(sm.canTransition(GamePhase.LEVEL_SELECT)).toBe(true)
    expect(sm.canTransition(GamePhase.BUILD)).toBe(true)
  })

  it('rejects invalid transitions', () => {
    const sm = new PhaseStateMachine()
    expect(sm.canTransition(GamePhase.WAVE)).toBe(false)
    expect(sm.canTransition(GamePhase.GAME_OVER)).toBe(false)
    expect(sm.canTransition(GamePhase.BUFF_SELECT)).toBe(false)
  })

  it('transition() updates current phase on valid transition', () => {
    const sm = new PhaseStateMachine()
    expect(sm.transition(GamePhase.BUILD)).toBe(true)
    expect(sm.current).toBe(GamePhase.BUILD)
  })

  it('transition() returns false and keeps phase on invalid transition', () => {
    const sm = new PhaseStateMachine()
    expect(sm.transition(GamePhase.WAVE)).toBe(false)
    expect(sm.current).toBe(GamePhase.MENU)
  })

  it('forceTransition() bypasses validation', () => {
    const sm = new PhaseStateMachine()
    sm.forceTransition(GamePhase.WAVE)
    expect(sm.current).toBe(GamePhase.WAVE)
  })

  it('follows full game lifecycle: MENU → BUILD → WAVE → BUFF → BUILD → WAVE → LEVEL_END', () => {
    const sm = new PhaseStateMachine()
    expect(sm.transition(GamePhase.BUILD)).toBe(true)
    expect(sm.transition(GamePhase.WAVE)).toBe(true)
    expect(sm.transition(GamePhase.BUFF_SELECT)).toBe(true)
    expect(sm.transition(GamePhase.BUILD)).toBe(true)
    expect(sm.transition(GamePhase.WAVE)).toBe(true)
    expect(sm.transition(GamePhase.LEVEL_END)).toBe(true)
    expect(sm.current).toBe(GamePhase.LEVEL_END)
  })

  it('WAVE → GAME_OVER is valid', () => {
    const sm = new PhaseStateMachine()
    sm.forceTransition(GamePhase.WAVE)
    expect(sm.transition(GamePhase.GAME_OVER)).toBe(true)
  })

  it('WAVE → BOSS_SHIELD → WAVE is valid', () => {
    const sm = new PhaseStateMachine()
    sm.forceTransition(GamePhase.WAVE)
    expect(sm.transition(GamePhase.BOSS_SHIELD)).toBe(true)
    expect(sm.transition(GamePhase.WAVE)).toBe(true)
  })

  it('GAME_OVER → MENU is valid (restart)', () => {
    const sm = new PhaseStateMachine()
    sm.forceTransition(GamePhase.GAME_OVER)
    expect(sm.transition(GamePhase.MENU)).toBe(true)
  })

  it('LEVEL_END → LEVEL_SELECT is valid', () => {
    const sm = new PhaseStateMachine()
    sm.forceTransition(GamePhase.LEVEL_END)
    expect(sm.transition(GamePhase.LEVEL_SELECT)).toBe(true)
  })

  // ── startLevel retry/replay coverage ──
  // Game.startLevel forceTransitions to MENU then setPhase(BUILD); the
  // transition table must allow that pattern from any prior phase, including
  // the terminal GAME_OVER (replay after defeat) and mid-game WAVE (early reset).
  describe('startLevel reset pattern (forceTransition(MENU) → transition(BUILD))', () => {
    function startLevelPattern(sm: PhaseStateMachine): boolean {
      sm.forceTransition(GamePhase.MENU)
      return sm.transition(GamePhase.BUILD)
    }

    it('GAME_OVER → BUILD via startLevel reset', () => {
      const sm = new PhaseStateMachine()
      sm.forceTransition(GamePhase.GAME_OVER)
      expect(startLevelPattern(sm)).toBe(true)
      expect(sm.current).toBe(GamePhase.BUILD)
    })

    it('WAVE → BUILD via startLevel reset (mid-game restart)', () => {
      const sm = new PhaseStateMachine()
      sm.forceTransition(GamePhase.WAVE)
      expect(startLevelPattern(sm)).toBe(true)
      expect(sm.current).toBe(GamePhase.BUILD)
    })

    it('GAME_OVER → BUILD also works as a direct transition', () => {
      // Defense-in-depth: even without the MENU reset, the table permits this
      // since users might short-circuit via the menu UI.
      const sm = new PhaseStateMachine()
      sm.forceTransition(GamePhase.GAME_OVER)
      expect(sm.transition(GamePhase.BUILD)).toBe(true)
    })
  })
})
