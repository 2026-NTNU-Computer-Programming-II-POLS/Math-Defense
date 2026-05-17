import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MagicModePanel from './MagicModePanel.vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, TowerType } from '@/data/constants'
import type { Tower } from '@/entities/types'

vi.mock('@/services/achievementService', () => ({
  achievementService: {
    unlockedIds: vi.fn(async () => new Set<string>()),
  },
}))

interface FakeEngine {
  towers: Tower[]
  eventBus: { emit: ReturnType<typeof vi.fn> }
}

function makeMagicTower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'm1',
    type: TowerType.MAGIC,
    x: 0,
    y: 0,
    configured: false,
    magicMode: 'debuff',
    magicExpression: '',
    ...overrides,
  } as Tower
}

function attachFakeEngine(towers: Tower[]): FakeEngine {
  const engine: FakeEngine = {
    towers,
    eventBus: {
      emit: vi.fn((event: string, payload: { towerId: string; expression?: string; mode?: string }) => {
        const tower = towers.find((t) => t.id === payload.towerId)
        if (!tower) return
        if (event === Events.MAGIC_FUNCTION_SELECTED) {
          tower.configured = true
          tower.magicExpression = payload.expression
        }
        if (event === Events.MAGIC_MODE_CHANGED) {
          tower.magicMode = payload.mode as Tower['magicMode']
        }
      }),
    },
  }
  const store = useGameStore()
  ;(store as unknown as { getEngine: () => FakeEngine }).getEngine = () => engine
  return engine
}

describe('MagicModePanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows Zone Mode immediately after applying a valid function', async () => {
    const engine = attachFakeEngine([makeMagicTower()])
    const wrapper = mount(MagicModePanel, { props: { towerId: 'm1' } })
    await flushPromises()

    expect(wrapper.find('[data-testid="magic-mode-buff"]').exists()).toBe(false)

    await wrapper.find('.fn-field').setValue('x')
    await wrapper.findAll('button').find((button) => button.text() === 'Apply')!.trigger('click')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.MAGIC_FUNCTION_SELECTED, {
      towerId: 'm1',
      expression: 'x',
    })
    expect(wrapper.find('[data-testid="magic-mode-buff"]').exists()).toBe(true)
  })

  it('updates the active Zone Mode button immediately after click', async () => {
    const engine = attachFakeEngine([makeMagicTower({ configured: true, magicMode: 'debuff' })])
    const wrapper = mount(MagicModePanel, { props: { towerId: 'm1' } })
    await flushPromises()

    const debuffButton = wrapper.find('[data-testid="magic-mode-debuff"]')
    const buffButton = wrapper.find('[data-testid="magic-mode-buff"]')
    expect(debuffButton.classes()).toContain('active')

    await buffButton.trigger('click')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.MAGIC_MODE_CHANGED, {
      towerId: 'm1',
      mode: 'buff',
    })
    expect(wrapper.find('[data-testid="magic-mode-debuff"]').classes()).not.toContain('active')
    expect(wrapper.find('[data-testid="magic-mode-buff"]').classes()).toContain('active')
  })
})
