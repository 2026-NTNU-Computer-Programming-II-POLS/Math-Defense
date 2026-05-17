import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SpellBar from './SpellBar.vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, GamePhase } from '@/data/constants'

const audio = vi.hoisted(() => ({
  cancel: vi.fn(),
}))

vi.mock('@/composables/useUiAudio', () => ({
  useUiAudio: () => ({
    click: vi.fn(),
    hover: vi.fn(),
    confirm: vi.fn(),
    cancel: audio.cancel,
  }),
}))

interface FakeEngine {
  eventBus: {
    on: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }
}

function attachFakeEngine(): FakeEngine {
  const engine: FakeEngine = {
    eventBus: {
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
    },
  }
  const store = useGameStore()
  ;(store as unknown as { getEngine: () => FakeEngine }).getEngine = () => engine
  return engine
}

describe('SpellBar.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    audio.cancel.mockClear()
  })

  it('plays the error/cancel sound instead of casting during BUILD', async () => {
    const engine = attachFakeEngine()
    const store = useGameStore()
    store.phase = GamePhase.BUILD

    const wrapper = mount(SpellBar)
    await flushPromises()

    await wrapper.find('[data-testid="spell-fireball"]').trigger('click')

    expect(audio.cancel).toHaveBeenCalledTimes(1)
    expect(engine.eventBus.emit).not.toHaveBeenCalledWith(
      Events.SPELL_CAST,
      expect.anything(),
    )
  })

  it('still casts self-target spells during WAVE', async () => {
    const engine = attachFakeEngine()
    const store = useGameStore()
    store.phase = GamePhase.WAVE

    const wrapper = mount(SpellBar)
    await flushPromises()

    await wrapper.find('[data-testid="spell-haste"]').trigger('click')

    expect(audio.cancel).not.toHaveBeenCalled()
    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.SPELL_CAST, {
      spellId: 'haste',
      x: 0,
      y: 0,
    })
  })
})
