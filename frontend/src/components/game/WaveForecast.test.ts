/**
 * Component tests for WaveForecast.vue (V3 Phase 6 §6.1).
 *
 * The forecast is pure presentation: it reads `phase` and the precomputed
 * `upcomingCounterEnemyTypes` off gameStore, so the store is mocked here and
 * the component is exercised purely on those two inputs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { GamePhase, EnemyType } from '@/data/constants'

const mockState = vi.hoisted(() => ({ phase: '', types: [] as string[] }))

vi.mock('@/stores/gameStore', () => ({
  useGameStore: () => ({
    get phase() { return mockState.phase },
    get upcomingCounterEnemyTypes() { return mockState.types },
  }),
}))

import WaveForecast from './WaveForecast.vue'

describe('WaveForecast.vue (V3 Phase 6 §6.1)', () => {
  beforeEach(() => {
    mockState.phase = GamePhase.BUILD
    mockState.types = []
  })

  it('renders nothing when the upcoming wave has no counter-enemies', () => {
    const wrapper = mount(WaveForecast)
    expect(wrapper.find('[data-testid="wave-forecast"]').exists()).toBe(false)
  })

  it('renders one warning line per counter-enemy, naming the enemy and its counter tower', () => {
    mockState.types = [EnemyType.REGENERATOR, EnemyType.BULWARK]
    const wrapper = mount(WaveForecast)

    const lines = wrapper.findAll('.forecast-line')
    expect(lines).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('Regenerator')
    expect(text).toContain('Limit tower')
    expect(text).toContain('Bulwark')
    expect(text).toContain('Matrix laser')
  })

  it('renders nothing outside the BUILD phase even when a wave has counter-enemies', () => {
    mockState.types = [EnemyType.SWARMLING]
    mockState.phase = GamePhase.WAVE
    const wrapper = mount(WaveForecast)
    expect(wrapper.find('[data-testid="wave-forecast"]').exists()).toBe(false)
  })
})
