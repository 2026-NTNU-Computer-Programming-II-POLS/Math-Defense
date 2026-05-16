/**
 * Pure helpers for splitting a manual markdown document into navigable
 * sections. Kept free of any Vue / DOM dependencies so it can be reused by
 * composables, tests, or other tools.
 *
 * Sectioning rule: split at every `## ` heading. Anything before the first
 * `## ` (typically the `# H1` and a short intro paragraph) is collected into
 * a synthetic "Overview" section so no content is dropped. The H1 line itself
 * is omitted from the Overview body because the modal already shows a title.
 */

import { renderMarkdown } from '@/utils/simpleMarkdown'

export type ManualSection = {
  id: string
  title: string
  html: string
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

export function splitManualSections(md: string, bookId: string): ManualSection[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const sections: ManualSection[] = []
  const seenIds = new Set<string>()

  const pushSection = (title: string, bodyLines: string[]): void => {
    const body = bodyLines.join('\n').trim()
    const finalTitle = title || 'Overview'
    if (!body && !title) return
    const baseId = `${bookId}-${slugify(finalTitle)}`
    let id = baseId
    let n = 2
    while (seenIds.has(id)) id = `${baseId}-${n++}`
    seenIds.add(id)
    sections.push({ id, title: finalTitle, html: renderMarkdown(body) })
  }

  const introLines: string[] = []
  let currentTitle: string | null = null
  let currentBody: string[] = []
  let seenH2 = false

  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (!seenH2) {
        const introBody = introLines.filter((l) => !/^#\s+/.test(l))
        if (introBody.join('').trim()) pushSection('Overview', introBody)
        seenH2 = true
      } else if (currentTitle !== null) {
        pushSection(currentTitle, currentBody)
      }
      currentTitle = m[1]
      currentBody = []
      continue
    }
    if (!seenH2) introLines.push(line)
    else currentBody.push(line)
  }

  if (currentTitle !== null) {
    pushSection(currentTitle, currentBody)
  } else if (!seenH2) {
    const introBody = introLines.filter((l) => !/^#\s+/.test(l))
    if (introBody.join('').trim()) pushSection('Overview', introBody)
  }

  return sections
}
