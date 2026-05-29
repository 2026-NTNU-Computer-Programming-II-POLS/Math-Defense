/**
 * Cross-platform glyph-fallback safety guard.
 *
 * The enemy / pet / spell renderers paint their bodies with `fillText` using
 * GLYPH_BODY_FONT_STACK. That stack pins `Cambria Math` (Windows-only) and
 * `STIX Two Math` (not bundled) first, then falls through to
 * Courier/monospace/serif on every non-Windows platform. A code point that is
 * absent from those fallback fonts renders as a tofu box (□) — and the
 * render-smoke tests cannot catch it, because they stub `fillText`.
 *
 * What this test IS: a static guard that every glyph the renderers paint is
 * restricted to code points known to exist across the standard fallback fonts
 * on Windows / macOS / Linux / Android / iOS. It would have FAILED on the
 * Bulwark `∥` (U+2225) and Boss-B `↻` (U+21BB) bodies before those were
 * converted to self-drawn canvas paths.
 *
 * What this test is NOT: it does not load a real font engine (happy-dom has
 * none, and CI Linux would not have Cambria Math anyway), so it cannot verify
 * pixel output. The defence here is "only ever ask the fallback fonts for
 * symbols they actually have". If a new glyph body needs a riskier symbol,
 * draw it as a path instead (see `_drawParallelBars` / `_drawLoopArrow` in
 * EnemyRenderer) rather than widening the safe set.
 *
 * Keep ENEMY_GLYPHS in sync with the literal glyph strings passed to
 * drawGlyphBody in EnemyRenderer.ts. Path-drawn bodies (Bulwark bars, Boss-B
 * lemniscate + loop-arrow satellites, the Split vinculum) are intentionally
 * absent — they use no font glyph and so carry no fallback risk.
 */
import { describe, it, expect } from 'vitest'

/**
 * Code points that exist in the standard fallback fonts across all target
 * platforms. Each entry below is justified; widening this set is a deliberate
 * decision, not a convenience — prefer a path-drawn body for risky symbols.
 */
function isCrossPlatformSafe(codePoint: number): boolean {
  // Basic Latin printable — universal. Covers x ( ) + = a b f 0 / etc.
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true
  // Latin-1 Supplement math: ÷ (U+00F7), × (U+00D7), ½ (U+00BD). Present in
  // every Latin fallback font including Courier New.
  if (codePoint === 0x00f7 || codePoint === 0x00d7 || codePoint === 0x00bd) return true
  // Greek (Σ ε δ …): present in the standard system fallbacks (Times/Arial/
  // DejaVu/Liberation all ship full Greek). Uppercase + lowercase blocks.
  if (codePoint >= 0x0391 && codePoint <= 0x03a9) return true
  if (codePoint >= 0x03b1 && codePoint <= 0x03c9) return true
  // Curated Mathematical-Operators entries verified present in the major
  // fallback fonts (Times New Roman / Arial / DejaVu / Courier New):
  //   ∀ U+2200 FOR ALL, − U+2212 MINUS SIGN, ≠ U+2260 NOT EQUAL TO.
  // NOTE: this set deliberately EXCLUDES spotty operators such as
  // ∥ U+2225 (PARALLEL TO) and the Arrows-block ↻ U+21BB, which are missing
  // from Courier New and other basic fallbacks.
  if (codePoint === 0x2200 || codePoint === 0x2212 || codePoint === 0x2260) return true
  return false
}

function unsafeCharsOf(glyph: string): string[] {
  return [...glyph].filter((ch) => !isCrossPlatformSafe(ch.codePointAt(0) as number))
}

// Mirror of the literal glyph strings drawn by EnemyRenderer (post Phase-6
// path conversion). Multi-character entries are bodies/fragments rendered as
// a single fillText call.
const ENEMY_GLYPHS: ReadonlyArray<{ readonly label: string; readonly glyph: string }> = [
  { label: 'general', glyph: 'x' },
  { label: 'fast', glyph: '÷' },
  { label: 'strong:(', glyph: '(' },
  { label: 'strong:)', glyph: ')' },
  { label: 'strong:+', glyph: '+' },
  { label: 'strong:minus', glyph: '−' },
  { label: 'strong:=', glyph: '=' },
  { label: 'split:numerator', glyph: 'a' },
  { label: 'split:denominator', glyph: 'b' },
  { label: 'helper', glyph: 'Σ' },
  { label: 'regenerator', glyph: 'lim' },
  { label: 'regen-aura-particle', glyph: '+ε' },
  { label: 'swarmling', glyph: 'ε' },
  { label: 'bossA:body', glyph: '∀' },
  { label: 'bossA:fragment-fx', glyph: 'f(x)' },
  { label: 'bossA:fragment-neq', glyph: '≠' },
  { label: 'bossA:fragment-zero', glyph: '0' },
]

describe('glyph fallback safety', () => {
  for (const { label, glyph } of ENEMY_GLYPHS) {
    it(`enemy glyph "${label}" (${glyph}) uses only fallback-safe code points`, () => {
      expect(unsafeCharsOf(glyph)).toEqual([])
    })
  }

  // Regression markers: these symbols were removed from glyph bodies in the
  // Phase-6 path conversion precisely because they tofu-box on non-Windows
  // fallback fonts. If the safe set is ever widened to admit them, that is a
  // mistake — re-draw the body as a path instead.
  it('classifies the removed tofu-risk symbols (∥, ↻) as UNSAFE', () => {
    expect(isCrossPlatformSafe('∥'.codePointAt(0) as number)).toBe(false)
    expect(isCrossPlatformSafe('↻'.codePointAt(0) as number)).toBe(false)
  })

  it('sanity-checks the classifier against known-safe basics', () => {
    for (const ch of ['x', '+', '=', '÷', 'Σ', 'ε', '∀', '−', '≠']) {
      expect(isCrossPlatformSafe(ch.codePointAt(0) as number)).toBe(true)
    }
  })
})
