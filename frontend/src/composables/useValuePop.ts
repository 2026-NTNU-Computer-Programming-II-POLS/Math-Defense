/**
 * useValuePop — Visual Redesign Phase 4 HUD value-feedback hook.
 *
 * Watches a numeric ref and exposes a short-lived "popping" flag plus a
 * direction (`up` when the value increased, `down` when it decreased) so a
 * consuming template can drive a CSS keyframe pop and tint flash.
 *
 * The pop window length is `ANIM.HUD_VALUE_POP` (seconds, from the canonical
 * `ANIM` table in `data/constants.ts`). A fresh change inside the active
 * window cancels and restarts the timer so rapid-fire updates do not get
 * swallowed mid-animation.
 *
 * Pause-safe note: HUD pops are cosmetic and live on wall-clock; they do not
 * influence the simulation, so `setTimeout` is correct here rather than the
 * engine's `dt`.
 */
import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { ANIM } from '@/data/constants'

export type ValuePopDirection = 'up' | 'down' | null

export interface UseValuePopResult {
  popping: Ref<boolean>
  direction: Ref<ValuePopDirection>
}

export function useValuePop(source: Ref<number>): UseValuePopResult {
  const popping = ref(false)
  const direction = ref<ValuePopDirection>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  watch(source, (next, prev) => {
    if (next === prev) return
    direction.value = next > prev ? 'up' : 'down'
    popping.value = true
    clearTimer()
    timer = setTimeout(() => {
      popping.value = false
      direction.value = null
      timer = null
    }, ANIM.HUD_VALUE_POP * 1000)
  })

  onScopeDispose(clearTimer)

  return { popping, direction }
}
