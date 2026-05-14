/**
 * Component tests for InitialAnswerView.vue (V3 fraction fill-in rework).
 *
 * Verifies the fill-in answer flow: a correct fraction → 'correct', a wrong
 * fraction → 'wrong', malformed input → a validation message with no submit,
 * and that equivalent fraction/decimal forms are both accepted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { GeneratedLevel } from '@/math/curve-types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import InitialAnswerView from './InitialAnswerView.vue'

// Endpoint P* = (3/2, -5/4). The single curve is the line through it with
// slope 1: y = x - 11/4.
const LEVEL: GeneratedLevel = {
  curves: [{ family: 'polynomial', degree: 1, coefficients: [1, -2.75] }],
  endpoint: { x: 1.5, y: -1.25 },
  region: { xMin: -1, xMax: 4, yMin: -4, yMax: 1 },
  interval: [-2, 5],
  starRating: 2,
  multisetLabel: '1',
}

function mountView() {
  window.history.replaceState({ level: JSON.stringify(LEVEL) }, '')
  return mount(InitialAnswerView, {
    global: { stubs: { MathDisplay: true } },
  })
}

describe('InitialAnswerView.vue — fraction fill-in', () => {
  beforeEach(() => {
    window.history.replaceState({}, '')
  })

  it('accepts a correct fraction answer', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('#ia-input-x').setValue('3/2')
    await wrapper.find('#ia-input-y').setValue('-5/4')
    await wrapper.find('.submit-btn').trigger('click')

    expect(wrapper.find('.result-correct').exists()).toBe(true)
    expect(wrapper.find('.result-wrong').exists()).toBe(false)
  })

  it('rejects a wrong answer', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('#ia-input-x').setValue('2')
    await wrapper.find('#ia-input-y').setValue('0')
    await wrapper.find('.submit-btn').trigger('click')

    expect(wrapper.find('.result-wrong').exists()).toBe(true)
    expect(wrapper.find('.result-correct').exists()).toBe(false)
  })

  it('shows a validation message and does not submit on malformed input', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('#ia-input-x').setValue('abc')
    await wrapper.find('#ia-input-y').setValue('-5/4')
    await wrapper.find('.submit-btn').trigger('click')

    expect(wrapper.find('.validation-msg').exists()).toBe(true)
    expect(wrapper.find('.result').exists()).toBe(false)
  })

  it('accepts an exact-decimal form equivalent to the fraction answer', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('#ia-input-x').setValue('1.5')
    await wrapper.find('#ia-input-y').setValue('-1.25')
    await wrapper.find('.submit-btn').trigger('click')

    expect(wrapper.find('.result-correct').exists()).toBe(true)
  })
})
