import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'

export interface CountdownReadout {
  readonly timeRemainingMs: number
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
  readonly isExpired: boolean
}

const ZERO: CountdownReadout = Object.freeze({
  timeRemainingMs: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true,
})

export function useCountdown(target: Ref<string | null>, tickMs = 1000): ComputedRef<CountdownReadout> {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(() => { now.value = Date.now() }, tickMs)
  })
  onUnmounted(() => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  })

  return computed<CountdownReadout>(() => {
    if (!target.value) return ZERO
    const targetMs = new Date(target.value).getTime()
    if (Number.isNaN(targetMs)) return ZERO
    const remaining = Math.max(0, targetMs - now.value)
    const totalSec = Math.floor(remaining / 1000)
    return {
      timeRemainingMs: remaining,
      hours: Math.floor(totalSec / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      isExpired: remaining === 0,
    }
  })
}
