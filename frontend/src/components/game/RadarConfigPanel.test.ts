/**
 * Component tests for RadarConfigPanel.vue typed-degree entry (Backlog item #4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RadarConfigPanel from './RadarConfigPanel.vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, TowerType } from '@/data/constants'
import type { Tower } from '@/entities/types'

interface FakeEngine {
  towers: Tower[]
  eventBus: { emit: ReturnType<typeof vi.fn> }
}

function makeRadarTower(id = 'r1'): Tower {
  return {
    id,
    type: TowerType.RADAR_A,
    x: 5,
    y: 5,
    arcStart: 0,
    arcEnd: Math.PI / 2,
    arcRestrict: false,
  } as Tower
}

function attachFakeEngine(towers: Tower[]): FakeEngine {
  const engine: FakeEngine = {
    towers,
    eventBus: { emit: vi.fn() },
  }
  const store = useGameStore()
  ;(store as unknown as { getEngine: () => FakeEngine }).getEngine = () => engine
  return engine
}

describe('RadarConfigPanel.vue — typed-degree entry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders type=number inputs for both arc fields', async () => {
    attachFakeEngine([makeRadarTower()])
    const wrapper = mount(RadarConfigPanel, { props: { towerId: 'r1' } })
    await flushPromises()

    const start = wrapper.find('[data-testid="radar-arc-start"]')
    const end = wrapper.find('[data-testid="radar-arc-end"]')
    expect(start.attributes('type')).toBe('number')
    expect(end.attributes('type')).toBe('number')
    expect(start.attributes('min')).toBe('0')
    expect(start.attributes('max')).toBe('360')
    expect(start.attributes('step')).toBe('5')
  })

  it('snaps 47 to 45 on Apply and emits the radian-converted value', async () => {
    const engine = attachFakeEngine([makeRadarTower()])
    const wrapper = mount(RadarConfigPanel, { props: { towerId: 'r1' } })
    await flushPromises()

    await wrapper.find('[data-testid="radar-arc-start"]').setValue(47)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="radar-apply"]').trigger('click')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledTimes(1)
    const [eventName, payload] = engine.eventBus.emit.mock.calls[0]
    expect(eventName).toBe(Events.RADAR_ARC_CHANGED)
    expect(payload.towerId).toBe('r1')
    expect(payload.arcStart).toBe(45 * Math.PI / 180)
    expect(payload.arcEnd).toBe(90 * Math.PI / 180)
    expect(payload.restrict).toBe(false)
  })

  it('clamps out-of-range degrees and snaps to nearest 5', async () => {
    const engine = attachFakeEngine([makeRadarTower()])
    const wrapper = mount(RadarConfigPanel, { props: { towerId: 'r1' } })
    await flushPromises()

    await wrapper.find('[data-testid="radar-arc-start"]').setValue(-30)
    await wrapper.find('[data-testid="radar-arc-end"]').setValue(999)
    await wrapper.find('[data-testid="radar-apply"]').trigger('click')

    const [, payload] = engine.eventBus.emit.mock.calls[0]
    expect(payload.arcStart).toBe(0)
    expect(payload.arcEnd).toBe(360 * Math.PI / 180)
  })

  it('does not emit on every keystroke — only on Apply', async () => {
    const engine = attachFakeEngine([makeRadarTower()])
    const wrapper = mount(RadarConfigPanel, { props: { towerId: 'r1' } })
    await flushPromises()

    const input = wrapper.find('[data-testid="radar-arc-start"]')
    await input.setValue(10)
    await input.setValue(20)
    await input.setValue(30)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })
})
