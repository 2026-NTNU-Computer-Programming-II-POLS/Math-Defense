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
 *   ![alt](image) — relative paths resolve against the app base
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

/**
 * Resolve a manual asset URL. External (`http(s)://`), root-absolute (`/…`),
 * anchor (`#…`) and `mailto:` targets pass through unchanged; a bare relative
 * path such as `towers/magic.png` is resolved against the app base so embedded
 * images load under any deployment base. Returns null for anything that does
 * not look like one of those, so the caller can render it inert.
 */
function resolveAssetUrl(url: string): string | null {
  if (/^https?:\/\//i.test(url) || url.startsWith('#') || url.startsWith('mailto:')) return url
  if (url.startsWith('/')) return url
  if (/^[\w][\w./-]*$/.test(url)) {
    const base = import.meta.env?.BASE_URL || '/'
    return `${base.endsWith('/') ? base : `${base}/`}${url.replace(/^\.?\//, '')}`
  }
  return null
}

function inline(s: string): string {
  let out = escapeHtml(s)
  // Inline code first so its contents do not get interpreted by the other rules.
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
  // Images: `![alt](src)`. Must run before the link rule (which would otherwise
  // match the `[alt](src)` tail) and before bold/italic so a sprite path is
  // never mangled. `alt` is already HTML-escaped; the src char class excludes
  // quotes/brackets so it is safe to splice into the attribute verbatim.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s"'<>]+)\)/g, (_m, alt: string, url: string) => {
    const src = resolveAssetUrl(url)
    if (!src) return alt
    return `<img src="${src}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" />`
  })
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  // Single-asterisk italic — exclude leading-space-no-content edge cases.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  // Disallow `"`, `'`, `<`, `>` in the URL capture — none of them belong in
  // a real URL and permitting them lets a crafted link like
  // `[x](https://a/"onmouseover=...)` break out of the href attribute and
  // inject JS. `&`, `<`, `>` are already encoded by escapeHtml() upstream,
  // and `"` is excluded by this character class, so the captured URL is safe
  // to splice into `href="…"` verbatim without further attribute-encoding —
  // re-encoding `&` here would double-escape query strings (`&amp;amp;`).
  out = out.replace(/\[([^\]]+)\]\(([^)\s"'<>]+)\)/g, (_m, text, url) => {
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

// Sentinel for an escaped pipe (`\|`) while splitting a table row. A NUL byte
// never appears in the authored manual text, so it is a safe stand-in: we swap
// escaped pipes out, split on the real column delimiters, then swap back —
// avoiding a lookbehind regex (unsupported on Safari < 16.4).
const ESCAPED_PIPE = '\u0000'

function splitRow(line: string): string[] {
  // Drop the leading and trailing | then split on column delimiters. A pipe
  // escaped as `\|` is a literal inside a cell (GFM behaviour) — needed for
  // math like `|C|` (absolute value) — so it is protected from the split and
  // restored afterwards. Cell text is otherwise preserved verbatim.
  const trimmed = line.trim()
  return trimmed
    .slice(1, -1)
    .replace(/\\\|/g, ESCAPED_PIPE)
    .split('|')
    .map((cell) => cell.trim().split(ESCAPED_PIPE).join('|'))
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
