/**
 * uiStore — V3 Phase 6 §6.2 first-encounter tracking.
 *
 * Covers the markCounterEnemySeen / hasSeenCounterEnemy round-trip and that
 * the seen set is persisted to localStorage so it survives a store re-init
 * (i.e. "first encounter" means first time ever, not first time this session).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './uiStore'
import { EnemyType } from '@/data/constants'

describe('uiStore — first-encounter tracking (V3 Phase 6 §6.2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('hasSeenCounterEnemy is false until markCounterEnemySeen is called', () => {
    const ui = useUiStore()
    expect(ui.hasSeenCounterEnemy(EnemyType.BULWARK)).toBe(false)
    ui.markCounterEnemySeen(EnemyType.BULWARK)
    expect(ui.hasSeenCounterEnemy(EnemyType.BULWARK)).toBe(true)
  })

  it('tracks each counter-enemy type independently', () => {
    const ui = useUiStore()
    ui.markCounterEnemySeen(EnemyType.BULWARK)
    expect(ui.hasSeenCounterEnemy(EnemyType.BULWARK)).toBe(true)
    expect(ui.hasSeenCounterEnemy(EnemyType.REGENERATOR)).toBe(false)
    expect(ui.hasSeenCounterEnemy(EnemyType.SWARMLING)).toBe(false)
  })

  it('marking the same type twice is idempotent', () => {
    const ui = useUiStore()
    ui.markCounterEnemySeen(EnemyType.SWARMLING)
    ui.markCounterEnemySeen(EnemyType.SWARMLING)
    expect([...ui.seenCounterEnemies]).toEqual([EnemyType.SWARMLING])
  })

  it('persists the seen set across a store re-init (localStorage)', async () => {
    const ui = useUiStore()
    ui.markCounterEnemySeen(EnemyType.REGENERATOR)
    ui.markCounterEnemySeen(EnemyType.BULWARK)
    // The persistence watcher flushes on the scheduler tick.
    await nextTick()

    setActivePinia(createPinia())
    const ui2 = useUiStore()
    expect(ui2.hasSeenCounterEnemy(EnemyType.REGENERATOR)).toBe(true)
    expect(ui2.hasSeenCounterEnemy(EnemyType.BULWARK)).toBe(true)
    expect(ui2.hasSeenCounterEnemy(EnemyType.SWARMLING)).toBe(false)
  })

  it('starts empty when localStorage has no prior record', () => {
    const ui = useUiStore()
    expect([...ui.seenCounterEnemies]).toEqual([])
  })
})
