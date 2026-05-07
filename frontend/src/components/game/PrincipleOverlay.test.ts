/**
 * Component tests for PrincipleOverlay.vue (Backlog item #1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PrincipleOverlay from './PrincipleOverlay.vue'

describe('PrincipleOverlay.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render when principleId is null', () => {
    const wrapper = mount(PrincipleOverlay, { props: { principleId: null } })
    expect(wrapper.find('[data-testid="principle-overlay"]').exists()).toBe(false)
  })

  it('renders title and prose for the supplied principle id', async () => {
    const wrapper = mount(PrincipleOverlay, { props: { principleId: 'chain-rule' } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Chain Rule')
    expect(text.length).toBeGreaterThan(20)
  })

  it('emits dismiss after the 8-second auto-dismiss timer elapses', async () => {
    const wrapper = mount(PrincipleOverlay, { props: { principleId: 'monty-hall' } })
    await flushPromises()
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    vi.advanceTimersByTime(7999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('emits dismiss on click and clears the visible card', async () => {
    const wrapper = mount(PrincipleOverlay, { props: { principleId: 'matrix-dot' } })
    await flushPromises()
    await wrapper.find('[data-testid="principle-overlay"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    // Internal state hides the card; the parent will normally clear the prop too.
    expect(wrapper.find('[data-testid="principle-overlay"]').exists()).toBe(false)
  })

  it('resets the timer when the principleId prop changes', async () => {
    const wrapper = mount(PrincipleOverlay, { props: { principleId: 'magic-curve-zone' } })
    await flushPromises()

    vi.advanceTimersByTime(5000)
    await wrapper.setProps({ principleId: 'radar-arc' })
    await flushPromises()

    // 5s of the original timer should not carry over.
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
