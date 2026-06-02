/**
 * useProfileInitials — server-backed avatar (letters + colour).
 *
 * The avatar lives on the user row, derived reactively from authStore.user, so
 * two accounts on the same browser never share it. setInitials/clearInitials
 * call the API and re-seed the store from the response. These tests pin that
 * contract plus the one-time legacy-localStorage scrub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/authService', () => ({
  authService: {
    updateProfileInitials: vi.fn(),
  },
}))

import { authService } from '@/services/authService'
import { useAuthStore, type User } from '@/stores/authStore'
import { useProfileInitials, PROFILE_COLOR_CHOICES } from './useProfileInitials'

const VALID_COLOR = PROFILE_COLOR_CHOICES[0].color

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'a@test.local',
    player_name: 'a',
    role: 'student',
    ia_unlock_earned: false,
    ia_recent_accuracy: 0,
    profile_initials_letters: null,
    profile_initials_color: null,
    ...overrides,
  }
}

describe('useProfileInitials', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('derives initials from the authenticated user', () => {
    const auth = useAuthStore()
    auth.setUser(makeUser({ profile_initials_letters: 'AB', profile_initials_color: VALID_COLOR }))
    const { initials } = useProfileInitials()
    expect(initials.value).toEqual({ letters: 'AB', color: VALID_COLOR })
  })

  it('returns null when the user has no avatar set', () => {
    const auth = useAuthStore()
    auth.setUser(makeUser())
    const { initials } = useProfileInitials()
    expect(initials.value).toBeNull()
  })

  it('returns null when logged out', () => {
    const { initials } = useProfileInitials()
    expect(initials.value).toBeNull()
  })

  it('setInitials uppercases, calls the API, and re-seeds the store from the response', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser())
    vi.mocked(authService.updateProfileInitials).mockResolvedValue({
      profile_initials_letters: 'XY',
      profile_initials_color: VALID_COLOR,
    } as never)

    const { setInitials, initials } = useProfileInitials()
    await setInitials('xy', VALID_COLOR)

    expect(authService.updateProfileInitials).toHaveBeenCalledWith({ letters: 'XY', color: VALID_COLOR })
    expect(auth.user?.profile_initials_letters).toBe('XY')
    expect(initials.value).toEqual({ letters: 'XY', color: VALID_COLOR })
  })

  it('setInitials rejects an out-of-palette colour without calling the API', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser())
    const { setInitials } = useProfileInitials()
    await setInitials('AB', '#000000')
    expect(authService.updateProfileInitials).not.toHaveBeenCalled()
  })

  it('setInitials ignores empty letters without calling the API', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser())
    const { setInitials } = useProfileInitials()
    await setInitials('   ', VALID_COLOR)
    expect(authService.updateProfileInitials).not.toHaveBeenCalled()
  })

  it('clearInitials calls the API with nulls and clears the store', async () => {
    const auth = useAuthStore()
    auth.setUser(makeUser({ profile_initials_letters: 'AB', profile_initials_color: VALID_COLOR }))
    vi.mocked(authService.updateProfileInitials).mockResolvedValue({
      profile_initials_letters: null,
      profile_initials_color: null,
    } as never)

    const { clearInitials, initials } = useProfileInitials()
    await clearInitials()

    expect(authService.updateProfileInitials).toHaveBeenCalledWith({ letters: null, color: null })
    expect(initials.value).toBeNull()
  })

  it('does not leak the avatar between two accounts on the same browser', () => {
    const auth = useAuthStore()
    const { initials } = useProfileInitials()

    auth.setUser(makeUser({ id: 'a', profile_initials_letters: 'AA', profile_initials_color: VALID_COLOR }))
    expect(initials.value).toEqual({ letters: 'AA', color: VALID_COLOR })

    // Switching to a second account that never set an avatar must show nothing,
    // not account A's choice.
    auth.setUser(makeUser({ id: 'b' }))
    expect(initials.value).toBeNull()
  })
})

describe('useProfileInitials — legacy key scrub', () => {
  it('removes the stale global localStorage key on first use', async () => {
    vi.resetModules()
    localStorage.setItem('mdf.profileInitials', JSON.stringify({ letters: 'ZZ', color: '#ffffff' }))
    setActivePinia(createPinia())
    const mod = await import('./useProfileInitials')
    mod.useProfileInitials()
    expect(localStorage.getItem('mdf.profileInitials')).toBeNull()
  })
})
