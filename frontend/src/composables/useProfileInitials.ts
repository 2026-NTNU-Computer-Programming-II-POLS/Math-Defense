import { computed, type ComputedRef } from 'vue'
import { TOWER_DEFS } from '@/data/tower-defs'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'

// The selectable color palette for the custom-initials avatar is the seven
// tower identity colors — sourced from TOWER_DEFS so a future palette change
// in the game data automatically flows here (no duplicated hex list).
export interface ProfileColorChoice {
  name: string
  color: string
}

export const PROFILE_COLOR_CHOICES: ReadonlyArray<ProfileColorChoice> =
  Object.values(TOWER_DEFS).map((d) => ({ name: d.name, color: d.color }))

const MAX_LETTERS = 2

export interface ProfileInitials {
  letters: string
  color: string
}

// One-time scrub: the previous build persisted the avatar to a single global
// localStorage key, leaking the choice between accounts on the same browser.
// The server is now the source of truth; remove the legacy key so stale data
// can never resurface for the wrong account.
let legacyScrubbed = false
function scrubLegacyKey(): void {
  if (legacyScrubbed) return
  legacyScrubbed = true
  try {
    window.localStorage.removeItem('mdf.profileInitials')
  } catch { /* best-effort */ }
}

export function useProfileInitials(): {
  initials: ComputedRef<ProfileInitials | null>
  setInitials: (letters: string, color: string) => Promise<void>
  clearInitials: () => Promise<void>
  isValidColor: (color: string) => boolean
} {
  scrubLegacyKey()
  const auth = useAuthStore()

  // Derived directly from the authenticated user, so two accounts on the
  // same browser can never see each other's avatar — each /me hydrates only
  // the signed-in user's persisted pair.
  const initials = computed<ProfileInitials | null>(() => {
    const u = auth.user
    if (!u || !u.profile_initials_letters || !u.profile_initials_color) return null
    return { letters: u.profile_initials_letters, color: u.profile_initials_color }
  })

  function applyServerResult(letters: string | null | undefined, color: string | null | undefined): void {
    // patchUser is a no-op when logged out and merges in place without
    // restarting the token probe (unlike setUser).
    auth.patchUser({
      profile_initials_letters: letters ?? null,
      profile_initials_color: color ?? null,
    })
  }

  async function setInitials(letters: string, color: string): Promise<void> {
    const trimmed = letters.trim().slice(0, MAX_LETTERS).toUpperCase()
    if (trimmed.length === 0) return
    if (!isValidColor(color)) return
    const updated = await authService.updateProfileInitials({ letters: trimmed, color })
    applyServerResult(updated.profile_initials_letters, updated.profile_initials_color)
  }

  async function clearInitials(): Promise<void> {
    const updated = await authService.updateProfileInitials({ letters: null, color: null })
    applyServerResult(updated.profile_initials_letters, updated.profile_initials_color)
  }

  function isValidColor(color: string): boolean {
    return PROFILE_COLOR_CHOICES.some((c) => c.color === color)
  }

  return {
    initials,
    setInitials,
    clearInitials,
    isValidColor,
  }
}
