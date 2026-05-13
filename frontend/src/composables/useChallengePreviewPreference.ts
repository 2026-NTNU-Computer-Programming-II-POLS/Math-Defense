import { ref, watch } from 'vue'

const STORAGE_KEY = 'territory:skipChallengePreview'

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const skipChallengePreview = ref<boolean>(readInitial())

watch(skipChallengePreview, (v) => {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable; preference is in-memory only.
  }
})

/**
 * User preference: when true, slot clicks bypass the pre-challenge
 * preview modal and start the run immediately. Default false.
 *
 * Per-user (browser-scoped). The plan §8 question of per-user vs.
 * per-activity is settled here as per-user; revisit if teachers ask
 * to force-disable for new students.
 */
export function useChallengePreviewPreference() {
  return { skipChallengePreview }
}
