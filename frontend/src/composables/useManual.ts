/**
 * State + loading logic for the in-app Manual viewer.
 *
 * Splits responsibility cleanly:
 *   - utils/manualSections.ts owns the markdown → sections transform.
 *   - utils/simpleMarkdown.ts  owns the markdown → HTML renderer.
 *   - This composable owns fetch + reactive state + navigation actions.
 *   - The component owns DOM (focus, scroll position) and presentation.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { splitManualSections, type ManualSection } from '@/utils/manualSections'

export type ManualMode = 'full' | 'reference'
export type ManualBookId = 'mechanics' | 'reference'

export type ManualBook = {
  id: ManualBookId
  label: string
  sections: ManualSection[]
}

export type UseManualReturn = {
  books: Ref<ManualBook[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  activeBookId: Ref<ManualBookId>
  activeSectionId: Ref<string>
  activeBook: ComputedRef<ManualBook | null>
  activeSection: ComputedRef<ManualSection | null>
  load: () => Promise<void>
  selectBook: (id: ManualBookId) => void
  selectSection: (id: string) => void
}

function joinBase(base: string, path: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${path}`
}

async function fetchMarkdown(url: string): Promise<string> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

export function useManual(mode: Ref<ManualMode>): UseManualReturn {
  const books = ref<ManualBook[]>([])
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const activeBookId = ref<ManualBookId>('reference')
  const activeSectionId = ref<string>('')

  const activeBook = computed<ManualBook | null>(
    () => books.value.find((b) => b.id === activeBookId.value) ?? books.value[0] ?? null,
  )

  const activeSection = computed<ManualSection | null>(() => {
    const book = activeBook.value
    if (!book) return null
    return book.sections.find((s) => s.id === activeSectionId.value) ?? book.sections[0] ?? null
  })

  async function load(): Promise<void> {
    if (books.value.length > 0) return
    loading.value = true
    error.value = null
    try {
      const base = import.meta.env.BASE_URL || '/'
      const wantMechanics = mode.value === 'full'
      const [mechanicsMd, referenceMd] = await Promise.all([
        wantMechanics ? fetchMarkdown(joinBase(base, 'manual/game-mechanics.md')) : Promise.resolve(''),
        fetchMarkdown(joinBase(base, 'manual/towers-and-enemies.md')),
      ])
      const next: ManualBook[] = []
      if (wantMechanics && mechanicsMd) {
        next.push({ id: 'mechanics', label: 'Gameplay', sections: splitManualSections(mechanicsMd, 'mechanics') })
      }
      next.push({ id: 'reference', label: 'Field Reference', sections: splitManualSections(referenceMd, 'reference') })
      books.value = next
      activeBookId.value = wantMechanics ? 'mechanics' : 'reference'
      const first = next.find((b) => b.id === activeBookId.value)?.sections[0]
      activeSectionId.value = first?.id ?? ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function selectBook(id: ManualBookId): void {
    if (activeBookId.value === id) return
    activeBookId.value = id
    const first = books.value.find((b) => b.id === id)?.sections[0]
    activeSectionId.value = first?.id ?? ''
  }

  function selectSection(id: string): void {
    activeSectionId.value = id
  }

  return {
    books,
    loading,
    error,
    activeBookId,
    activeSectionId,
    activeBook,
    activeSection,
    load,
    selectBook,
    selectSection,
  }
}
