/**
 * Component tests for LevelSelectView.vue (Backlog item §5).
 *
 * Verifies the Star-5 personal lock surfaces correctly: the button is disabled
 * with the unlock tooltip when ia_unlock_earned is false, and clicking the
 * disabled card does not navigate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const pushMock = vi.fn()
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: pushMock }) }
})

const meMock = vi.fn()
vi.mock('@/services/authService', () => ({
  authService: {
    me: () => meMock(),
  },
}))

// Recommendation fetch is best-effort in production; mock it out so tests
// don't hit the network when the dev backend isn't up.
const recMock = vi.fn()
vi.mock('@/services/recommendationService', () => ({
  recommendationService: {
    me: () => recMock(),
  },
}))

import LevelSelectView from './LevelSelectView.vue'
import { useAuthStore } from '@/stores/authStore'

function makeUser(iaUnlockEarned: boolean) {
  return {
    id: 'u1',
    email: 'u1@test.local',
    player_name: 'u1',
    role: 'student' as const,
    ia_unlock_earned: iaUnlockEarned,
    ia_recent_accuracy: 0,
    profile_initials_letters: null,
    profile_initials_color: null,
  }
}

describe('LevelSelectView.vue — Star-5 unlock gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushMock.mockReset()
    meMock.mockReset()
    recMock.mockReset()
    recMock.mockResolvedValue({
      star: 3,
      weighted_mean: 0.5,
      lowest_competency: 'MAGIC',
      lowest_mean: 0.5,
      talent_node_id: 'magic_zone_strength',
    })
    meMock.mockResolvedValue({
      id: 'u1',
      email: 'u1@test.local',
      player_name: 'u1',
      role: 'student',
      ia_unlock_earned: false,
    })
  })

  it('renders Star-5 disabled with the unlock tooltip when ia_unlock_earned is false', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser(false))

    const wrapper = mount(LevelSelectView)
    await flushPromises()

    const cards = wrapper.findAll('button.star-card')
    expect(cards.length).toBe(5)
    const star5 = cards[4]
    expect(star5.attributes('disabled')).toBeDefined()
    expect(star5.classes()).toContain('locked')
    expect(star5.attributes('title')).toBe(
      'Complete the Initial Answer phase correctly at any star rating to unlock.',
    )
  })

  it('does not select Star-5 when its card is clicked while locked', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser(false))

    const wrapper = mount(LevelSelectView)
    await flushPromises()

    // Try to force-select Star-5 by clicking its (disabled) card. selectStar()
    // bails out for locked stars, so no .selected class should land on Star-5.
    const cards = wrapper.findAll('button.star-card')
    await cards[4].trigger('click')

    expect(cards[4].classes()).not.toContain('selected')
    // Default Star-1 retains the selection.
    expect(cards[0].classes()).toContain('selected')
  })

  it('renders Star-5 enabled when ia_unlock_earned is true', async () => {
    meMock.mockResolvedValue({
      id: 'u1',
      email: 'u1@test.local',
      player_name: 'u1',
      role: 'student',
      ia_unlock_earned: true,
    })
    const auth = useAuthStore()
    auth.setUser(makeUser(true))

    const wrapper = mount(LevelSelectView)
    await flushPromises()

    const star5 = wrapper.findAll('button.star-card')[4]
    expect(star5.attributes('disabled')).toBeUndefined()
    expect(star5.classes()).not.toContain('locked')
  })
})
