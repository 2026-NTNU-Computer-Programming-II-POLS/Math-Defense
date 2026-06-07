/**
 * Component tests for LimitQuestionPanel.vue typed-entry mode (Backlog item #3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LimitQuestionPanel from './LimitQuestionPanel.vue'
import { useGameStore } from '@/stores/gameStore'
import { Events, TowerType } from '@/data/constants'
import { outcomeLabel } from '@/math/limit-evaluator'
import type { LimitResult, Tower } from '@/entities/types'

interface FakeEngine {
  towers: Tower[]
  eventBus: { emit: ReturnType<typeof vi.fn> }
  getSystem: (key: string) => { generateQuestion: () => unknown } | undefined
}

function makeFakeTower(id = 't1'): Tower {
  return {
    id,
    type: TowerType.LIMIT,
    x: 5,
    y: 0,
  } as Tower
}

function makeQuestion(correct: LimitResult, choices?: LimitResult[]) {
  return {
    fExpr: 'f(x) = 3(x - 5)',
    a: 5,
    denom: '(x - 5)',
    correctAnswer: correct,
    choices: choices ?? [correct],
  }
}

function attachFakeEngine(towers: Tower[], correct: LimitResult): FakeEngine {
  const engine: FakeEngine = {
    towers,
    eventBus: { emit: vi.fn() },
    getSystem: (key: string) =>
      key === 'limitTower' ? { generateQuestion: () => makeQuestion(correct) } : undefined,
  }
  const store = useGameStore()
  // Pinia setup stores expose actions as direct properties; overriding here is
  // the simplest way to inject a fake engine without exercising bindEngine().
  ;(store as unknown as { getEngine: () => FakeEngine }).getEngine = () => engine
  return engine
}

describe('LimitQuestionPanel.vue — typed entry (Star ≥ 4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders MCQ choices when starRating < 4', async () => {
    const store = useGameStore()
    store.starRating = 3
    attachFakeEngine([makeFakeTower()], { outcome: '+c', value: 3 })

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-input"]').exists()).toBe(false)
    expect(wrapper.findAll('.choice-btn').length).toBeGreaterThan(0)
  })

  it('renders typed-entry input when starRating >= 4', async () => {
    const store = useGameStore()
    store.starRating = 4
    attachFakeEngine([makeFakeTower()], { outcome: '+c', value: 3 })

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-input"]').exists()).toBe(true)
    expect(wrapper.findAll('.choice-btn').length).toBe(0)
  })

  it('shows inline error on unparseable input and does not emit', async () => {
    const store = useGameStore()
    store.starRating = 4
    const engine = attachFakeEngine([makeFakeTower()], { outcome: '+c', value: 3 })

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    await wrapper.find('[data-testid="limit-typed-input"]').setValue('not a number')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-error"]').exists()).toBe(true)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })

  it('shows error on parseable but incorrect answer and does not emit', async () => {
    const store = useGameStore()
    store.starRating = 4
    const engine = attachFakeEngine([makeFakeTower()], { outcome: '+c', value: 3 })

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    // Wrong sign: canonical is +3, user types -3.
    await wrapper.find('[data-testid="limit-typed-input"]').setValue('-3')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-error"]').exists()).toBe(true)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })

  it('shows error when value mismatches even though outcome matches (+c 3 vs +c 5)', async () => {
    const store = useGameStore()
    store.starRating = 4
    const engine = attachFakeEngine([makeFakeTower()], { outcome: '+c', value: 3 })

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    await wrapper.find('[data-testid="limit-typed-input"]').setValue('5')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-error"]').exists()).toBe(true)
    expect(engine.eventBus.emit).not.toHaveBeenCalled()
  })

  it('emits LIMIT_ANSWER with the canonical result on a correct typed answer', async () => {
    const store = useGameStore()
    store.starRating = 4
    const correct: LimitResult = { outcome: '+c', value: 3 }
    const engine = attachFakeEngine([makeFakeTower()], correct)

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    await wrapper.find('[data-testid="limit-typed-input"]').setValue('3')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="limit-typed-error"]').exists()).toBe(false)
    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.LIMIT_ANSWER, {
      towerId: 't1',
      answer: correct,
    })
  })

  it('accepts +inf for the +inf canonical answer (categorical outcomes ignore value)', async () => {
    const store = useGameStore()
    store.starRating = 4
    const correct: LimitResult = { outcome: '+inf', value: Infinity }
    const engine = attachFakeEngine([makeFakeTower()], correct)

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    await wrapper.find('[data-testid="limit-typed-input"]').setValue('infinity')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.LIMIT_ANSWER, {
      towerId: 't1',
      answer: correct,
    })
  })

  it('accepts DNE for the constant (limit-undefined) canonical answer', async () => {
    const store = useGameStore()
    store.starRating = 4
    const correct: LimitResult = { outcome: 'constant', value: 4 }
    const engine = attachFakeEngine([makeFakeTower()], correct)

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    await wrapper.find('[data-testid="limit-typed-input"]').setValue('DNE')
    await wrapper.find('form.typed-entry').trigger('submit')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(Events.LIMIT_ANSWER, {
      towerId: 't1',
      answer: correct,
    })
  })
})

describe('LimitQuestionPanel.vue — MCQ preview & re-answer (Star 1–3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders each MCQ choice button with its outcomeLabel preview text', async () => {
    const store = useGameStore()
    store.starRating = 3
    const choices: LimitResult[] = [
      { outcome: '+c', value: 3 },
      { outcome: 'zero', value: 0 },
      { outcome: '-inf', value: -Infinity },
    ]
    const engine = attachFakeEngine([makeFakeTower()], choices[0])
    engine.getSystem = (key: string) =>
      key === 'limitTower'
        ? { generateQuestion: () => makeQuestion(choices[0], choices) }
        : undefined

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    const btns = wrapper.findAll('.choice-btn')
    expect(btns.length).toBe(choices.length)
    btns.forEach((btn, i) => {
      expect(btn.text()).toBe(outcomeLabel(choices[i]))
    })
  })

  it('lets an already-answered tower re-open its question and commit a new answer', async () => {
    const store = useGameStore()
    store.starRating = 3
    const correct: LimitResult = { outcome: '+c', value: 3 }
    const answeredTower = { id: 't1', type: TowerType.LIMIT, x: 5, y: 0, limitResult: correct } as Tower
    const engine = attachFakeEngine([answeredTower], correct)

    const wrapper = mount(LimitQuestionPanel, { props: { towerId: 't1' } })
    await flushPromises()

    // Starts locked on the result, no question block.
    expect(wrapper.findAll('.choice-btn').length).toBe(0)
    expect(wrapper.find('[data-testid="limit-change-answer"]').exists()).toBe(true)

    await wrapper.find('[data-testid="limit-change-answer"]').trigger('click')
    await flushPromises()

    const btns = wrapper.findAll('.choice-btn')
    expect(btns.length).toBeGreaterThan(0)

    await btns[0].trigger('click')
    await flushPromises()

    expect(engine.eventBus.emit).toHaveBeenCalledWith(
      Events.LIMIT_ANSWER,
      expect.objectContaining({ towerId: 't1' }),
    )
  })
})
