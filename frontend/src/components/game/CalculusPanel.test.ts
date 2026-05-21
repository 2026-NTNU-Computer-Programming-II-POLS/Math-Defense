/**
 * Component tests for CalculusPanel.vue — the operation quiz. The student must
 * type the derivative / integral result themselves; the panel never displays
 * the answer, and only a correct answer commits the operation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CalculusPanel from './CalculusPanel.vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, TowerType } from '@/data/constants'
import type { CalculusState, Tower } from '@/entities/types'

interface FakeEngine {
  towers: Tower[]
  eventBus: { emit: ReturnType<typeof vi.fn> }
  getSystem: (key: string) => unknown
}

function makeTower(id = 't1'): Tower {
  return { id, type: TowerType.CALCULUS, x: 5, y: 0 } as Tower
}

function attachEngine(towers: Tower[]): FakeEngine {
  const engine: FakeEngine = {
    towers,
    eventBus: { emit: vi.fn() },
    getSystem: () => undefined,
  }
  const store = useGameStore()
  ;(store as unknown as { getEngine: () => FakeEngine }).getEngine = () => engine
  return engine
}

function setState(state: CalculusState, towerId = 't1') {
  useGameStore().calculusStates = { [towerId]: state }
}

describe('CalculusPanel.vue — operation quiz', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('never shows the operation result before it is solved', async () => {
    const store = useGameStore()
    store.gold = 500
    attachEngine([makeTower()])
    setState({ coefficient: 3, exponent: 2, currentExpr: '3x^2', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()

    // f'(3x^2) = 6x — that answer must not appear anywhere.
    expect(wrapper.text()).not.toContain('6x')

    await wrapper.find('[data-testid="calc-op-derivative"]').trigger('click')
    expect(wrapper.text()).not.toContain('6x')
  })

  it('reveals the typed-answer prompt only after an operation is selected', async () => {
    const store = useGameStore()
    store.gold = 500
    attachEngine([makeTower()])
    setState({ coefficient: 3, exponent: 2, currentExpr: '3x^2', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()

    expect(wrapper.find('[data-testid="calc-answer-input"]').exists()).toBe(false)
    await wrapper.find('[data-testid="calc-op-derivative"]').trigger('click')
    expect(wrapper.find('[data-testid="calc-answer-input"]').exists()).toBe(true)
  })

  it('shows an error and does not commit on an incorrect answer', async () => {
    const store = useGameStore()
    store.gold = 500
    const engine = attachEngine([makeTower()])
    setState({ coefficient: 3, exponent: 2, currentExpr: '3x^2', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()
    await wrapper.find('[data-testid="calc-op-derivative"]').trigger('click')

    await wrapper.find('[data-testid="calc-answer-input"]').setValue('5x')
    await wrapper.find('form.op-quiz').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="calc-answer-error"]').exists()).toBe(true)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })

  it('shows an error and does not commit on an unparseable answer', async () => {
    const store = useGameStore()
    store.gold = 500
    const engine = attachEngine([makeTower()])
    setState({ coefficient: 3, exponent: 2, currentExpr: '3x^2', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()
    await wrapper.find('[data-testid="calc-op-derivative"]').trigger('click')

    await wrapper.find('[data-testid="calc-answer-input"]').setValue('???')
    await wrapper.find('form.op-quiz').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="calc-answer-error"]').exists()).toBe(true)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })

  it('emits CALCULUS_OPERATION on a correct derivative answer', async () => {
    const store = useGameStore()
    store.gold = 500
    const engine = attachEngine([makeTower()])
    setState({ coefficient: 3, exponent: 2, currentExpr: '3x^2', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()
    await wrapper.find('[data-testid="calc-op-derivative"]').trigger('click')

    await wrapper.find('[data-testid="calc-answer-input"]').setValue('6x')
    await wrapper.find('form.op-quiz').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="calc-answer-error"]').exists()).toBe(false)
    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.CALCULUS_OPERATION, {
      towerId: 't1',
      operation: 'derivative',
    })
  })

  it('accepts an algebraically equivalent integral answer', async () => {
    const store = useGameStore()
    store.gold = 500
    const engine = attachEngine([makeTower()])
    // ∫5x dx = (5/2)x^2 — typed here in decimal form.
    setState({ coefficient: 5, exponent: 1, currentExpr: '5x', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()
    await wrapper.find('[data-testid="calc-op-integral"]').trigger('click')

    await wrapper.find('[data-testid="calc-answer-input"]').setValue('2.5x^2')
    await wrapper.find('form.op-quiz').trigger('submit')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.CALCULUS_OPERATION, {
      towerId: 't1',
      operation: 'integral',
    })
  })

  it('grades the second derivative as a single direct answer', async () => {
    const store = useGameStore()
    store.gold = 500
    const engine = attachEngine([makeTower()])
    // d²/dx²(3x^3) = 18x.
    setState({ coefficient: 3, exponent: 3, currentExpr: '3x^3', opApplied: false })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()
    await wrapper.find('[data-testid="calc-op-derivative2"]').trigger('click')

    await wrapper.find('[data-testid="calc-answer-input"]').setValue('18x')
    await wrapper.find('form.op-quiz').trigger('submit')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.CALCULUS_OPERATION, {
      towerId: 't1',
      operation: 'derivative2',
    })
  })

  it('disables operations when a chain op is unaffordable', async () => {
    const store = useGameStore()
    store.gold = 0
    attachEngine([makeTower()])
    // opApplied = true → the next op is a paid chain op.
    setState({ coefficient: 3, exponent: 3, currentExpr: '3x^3', opApplied: true })

    const wrapper = mount(CalculusPanel, { props: { towerId: 't1' } })
    await flushPromises()

    expect(
      wrapper.find('[data-testid="calc-op-derivative"]').attributes('disabled'),
    ).toBeDefined()
  })
})
