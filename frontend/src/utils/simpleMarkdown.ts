/**
 * Minimal markdown → HTML renderer for the in-app Manual viewer.
 *
 * Supports the subset of markdown the manual files actually use:
 *   # / ## / ### / #### headings
 *   - bullet lists
 *   | tables | with | header rows |
 *   ``` fenced code blocks ```
 *   `inline code`
 *   **bold**, *italic*
 *   [link text](url)
 *   --- horizontal rule
 *   blank-line-separated paragraphs
 *
 * Input is authored in-tree (frontend/public/manual/*.md) and is not
 * user-supplied, but the inline pass still escapes <, >, & so any future
 * change cannot regress into XSS.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(s: string): string {
  let out = escapeHtml(s)
  // Inline code first so its contents do not get interpreted by the other rules.
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  // Single-asterisk italic — exclude leading-space-no-content edge cases.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const safe = /^https?:\/\/|^\/|^#|^mailto:/i.test(url)
    return safe
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : `${text}`
  })
  return out
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

function splitRow(line: string): string[] {
  // Drop the leading and trailing | then split. Preserve cell text verbatim
  // (no trim of internal spaces beyond what trim()'ing each cell does below).
  const trimmed = line.trim()
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    // Fenced code block.
    if (trimmed.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing fence
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // Horizontal rule.
    if (/^-{3,}$/.test(trimmed)) {
      out.push('<hr />')
      i++
      continue
    }

    // Heading (1–4 hash levels).
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    // Table — collect consecutive | … | lines, then strip the separator row.
    if (isTableRow(line)) {
      const rows: string[] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i])
        i++
      }
      // Detect separator row of the form |---|---|. If present (index 1), the
      // first row is the header. Otherwise treat all rows as body cells.
      let header: string[] | null = null
      let bodyStart = 0
      const sep = rows[1]?.trim()
      const isSep = sep && /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|$/.test(sep)
      if (isSep) {
        header = splitRow(rows[0])
        bodyStart = 2
      }
      const body = rows.slice(bodyStart).map(splitRow)
      const parts: string[] = ['<table>']
      if (header) {
        parts.push('<thead><tr>')
        for (const h of header) parts.push(`<th>${inline(h)}</th>`)
        parts.push('</tr></thead>')
      }
      parts.push('<tbody>')
      for (const r of body) {
        parts.push('<tr>')
        for (const c of r) parts.push(`<td>${inline(c)}</td>`)
        parts.push('</tr>')
      }
      parts.push('</tbody></table>')
      out.push(parts.join(''))
      continue
    }

    // Bullet list.
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*-\s+/, '')
        items.push(`<li>${inline(item)}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // Paragraph — consume until blank line or block-starting line.
    const para: string[] = [line]
    i++
    while (i < lines.length) {
      const next = lines[i]
      const nextTrim = next.trim()
      if (nextTrim === '') break
      if (/^#{1,4}\s+/.test(nextTrim)) break
      if (/^-{3,}$/.test(nextTrim)) break
      if (nextTrim.startsWith('```')) break
      if (isTableRow(next)) break
      if (/^\s*-\s+/.test(next)) break
      para.push(next)
      i++
    }
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }

  return out.join('\n')
}
