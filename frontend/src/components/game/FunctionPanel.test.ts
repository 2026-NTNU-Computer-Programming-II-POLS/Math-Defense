/**
 * Unit tests for FunctionPanel.vue (construction plan P5-T6).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FunctionPanel from './FunctionPanel.vue'
import { useGameStore, type PathSegmentView } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'

function seedSegments(views: ReadonlyArray<PathSegmentView>, currentId: string | null): void {
  const g = useGameStore()
  g.setPathPanelSegments(views)
  g.setCurrentSegment(currentId)
}

const sampleSegments: ReadonlyArray<PathSegmentView> = [
  { id: 's1', label: 'Seg 1', expr: 'y = 0', xRange: [-3, 8],
    params: { kind: 'horizontal', y: 0 },
    samples: [{ x: -3, y: 0 }, { x: 8, y: 0 }] },
  { id: 's2', label: 'Seg 2', expr: 'y = x', xRange: [8, 17],
    params: { kind: 'linear', slope: 1, intercept: 0 },
    samples: [{ x: 8, y: 8 }, { x: 17, y: 17 }] },
  { id: 's3', label: 'Seg 3', expr: 'y = 2', xRange: [17, 25],
    params: { kind: 'horizontal', y: 2 },
    samples: [{ x: 17, y: 2 }, { x: 25, y: 2 }] },
]

describe('FunctionPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hides when segments slice is empty', () => {
    const wrapper = mount(FunctionPanel)
    expect(wrapper.find('.fn-panel').exists()).toBe(false)
  })

  it('renders current segment header and expression', async () => {
    seedSegments(sampleSegments, 's2')
    const wrapper = mount(FunctionPanel)
    await flushPromises()
    expect(wrapper.find('.fn-current-label').text()).toBe('Seg 2')
    expect(wrapper.find('[data-testid="fn-expr"]').text()).toBe('y = x')
  })

  it('switches when currentSegmentId changes', async () => {
    seedSegments(sampleSegments, 's1')
    const wrapper = mount(FunctionPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="fn-expr"]').text()).toBe('y = 0')

    useGameStore().setCurrentSegment('s3')
    await flushPromises()
    expect(wrapper.find('[data-testid="fn-expr"]').text()).toBe('y = 2')
    expect(wrapper.find('.fn-current-label').text()).toBe('Seg 3')
  })

  it('lists every segment with the expected status class', async () => {
    // Enemies walk from startX (rightmost, highest-index segment) toward
    // targetX (index 0). With current = s2 (idx 1), s3 (idx 2) is already
    // crossed → 'past', s1 (idx 0) is yet to come → 'upcoming'.
    seedSegments(sampleSegments, 's2')
    const wrapper = mount(FunctionPanel)
    await flushPromises()
    const items = wrapper.findAll('.fn-seg')
    expect(items).toHaveLength(3)
    expect(items[0]!.classes()).toContain('fn-seg-upcoming')
    expect(items[1]!.classes()).toContain('fn-seg-active')
    expect(items[2]!.classes()).toContain('fn-seg-past')
  })

  it('hover on a segment writes uiStore.hoveredSegmentId; leave clears it', async () => {
    seedSegments(sampleSegments, 's2')
    const ui = useUiStore()
    const wrapper = mount(FunctionPanel)
    await flushPromises()

    const target = wrapper.findAll('.fn-seg')[2]!
    await target.trigger('mouseenter')
    expect(ui.hoveredSegmentId).toBe('s3')
    await target.trigger('mouseleave')
    expect(ui.hoveredSegmentId).toBe(null)
  })
})
