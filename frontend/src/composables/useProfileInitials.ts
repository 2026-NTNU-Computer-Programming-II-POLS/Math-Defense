import { ref, readonly, watch, type Ref, type DeepReadonly } from 'vue'
import { TOWER_DEFS } from '@/data/tower-defs'

// The selectable color palette for the custom-initials avatar is the seven
// tower identity colors — sourced from TOWER_DEFS so a future palette change
// in the game data automatically flows here (no duplicated hex list).
export interface ProfileColorChoice {
  name: string
  color: string
}

export const PROFILE_COLOR_CHOICES: ReadonlyArray<ProfileColorChoice> =
  Object.values(TOWER_DEFS).map((d) => ({ name: d.name, color: d.color }))

const STORAGE_KEY = 'mdf.profileInitials'
const MAX_LETTERS = 2

export interface ProfileInitials {
  letters: string
  color: string
}

function readFromStorage(): ProfileInitials | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProfileInitials>
    if (
      typeof parsed.letters === 'string' &&
      parsed.letters.length > 0 &&
      typeof parsed.color === 'string'
    ) {
      return {
        letters: parsed.letters.slice(0, MAX_LETTERS).toUpperCase(),
        color: parsed.color,
      }
    }
  } catch {
    // localStorage unavailable (private mode) or malformed JSON — fall through.
  }
  return null
}

// Singleton reactive state. Sharing one ref across consumers means a change
// inside ProfileView reflects immediately in MenuView's avatar bubble without
// a page reload.
const profileInitials: Ref<ProfileInitials | null> = ref(readFromStorage())

watch(profileInitials, (next) => {
  try {
    if (next === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  } catch {
    // Persistence is best-effort; an unavailable localStorage shouldn't break
    // the in-memory selection.
  }
}, { deep: true })

export function useProfileInitials(): {
  initials: DeepReadonly<Ref<ProfileInitials | null>>
  setInitials: (letters: string, color: string) => void
  clearInitials: () => void
  isValidColor: (color: string) => boolean
} {
  function setInitials(letters: string, color: string): void {
    const trimmed = letters.trim().slice(0, MAX_LETTERS).toUpperCase()
    if (trimmed.length === 0) return
    if (!isValidColor(color)) return
    profileInitials.value = { letters: trimmed, color }
  }

  function clearInitials(): void {
    profileInitials.value = null
  }

  function isValidColor(color: string): boolean {
    return PROFILE_COLOR_CHOICES.some((c) => c.color === color)
  }

  return {
    initials: readonly(profileInitials),
    setInitials,
    clearInitials,
    isValidColor,
  }
}
