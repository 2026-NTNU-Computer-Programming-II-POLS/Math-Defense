# Enemy Glyph — Cross-Platform Font Fallback Audit

**Date:** 2026-05-29
**Scope:** Canvas `fillText` glyph bodies painted by `EnemyRenderer`,
`PetRenderer`, and `SpellEffectRenderer` via `drawGlyphBody`
(`frontend/src/renderers/primitives.ts`).

## Why this matters

Glyph bodies are drawn with `GLYPH_BODY_FONT_STACK`:

```
'Cambria Math', 'STIX Two Math', 'Courier New', Courier, monospace, serif
```

- `Cambria Math` is **Windows-only**.
- `STIX Two Math` is **not bundled** (no webfont shipped) and is rarely
  installed by default.

So on **macOS / Linux / Android / iOS** the stack falls through to
`Courier New` / `monospace` / `serif`. Any Unicode code point absent from
those fallback fonts renders as a **tofu box (□)**. A Windows dev machine
never reproduces this — which is exactly why it slips through.

The render-smoke tests (`EnemyRenderer.test.ts`) **cannot** catch this: they
stub `fillText` as a no-op and only assert "does not throw". The real guard is
`glyph-fallback-safety.test.ts`, which restricts glyph bodies to a curated set
of fallback-safe code points.

## Risk classification

| Risk | Meaning |
|------|---------|
| **Low** | Present in essentially all fallback fonts (Basic Latin, Latin-1, Greek, near-universal operators). |
| **Medium** | Present in major fallbacks (Times/Arial/DejaVu) but spotty in some monospace; acceptable but a bundled math webfont would make it guaranteed. |
| **High** | Missing from common fallbacks (e.g. Courier New) → tofu risk. **Must be path-drawn, not a glyph.** |

## Enemy glyphs (current, post-fix)

| Enemy | Glyph | Code point(s) | Risk | Notes |
|-------|-------|---------------|------|-------|
| general | `x` | U+0078 | Low | ASCII |
| fast | `÷` | U+00F7 | Low | Latin-1 division sign |
| strong | `(` `)` `+` `=` | U+0028/0029/002B/003D | Low | ASCII |
| strong | `−` | **U+2212** (MINUS SIGN, not ASCII `-`) | Low–Med | Widely present; true math minus |
| split | `a` `b` | U+0061/0062 | Low | ASCII |
| helper | `Σ` | U+03A3 | Low | Greek; in all system fallbacks |
| regenerator | `lim` | ASCII | Low | reads as text, but renders |
| regen aura | `+ε` | U+002B + U+03B5 | Low | Greek epsilon |
| swarmling | `ε` | U+03B5 | Low | Greek |
| boss A | `∀` | U+2200 (FOR ALL) | Low–Med | In Times/Arial/DejaVu/Courier New |
| boss A | `f(x)` `≠` `0` | ASCII + U+2260 | Low–Med | `≠` near-universal |

### Path-drawn bodies (no font glyph — zero fallback risk)

| Enemy | Was | Now |
|-------|-----|-----|
| **bulwark** | `∥` U+2225 (**High** — missing from Courier New) | `_drawParallelBars` (two filled bars + fringe recipe) |
| **boss B** satellites | `↻` U+21BB (**High** — Arrows block, spotty) | `_drawLoopArrow` (arc + arrowhead path) |
| boss B body | — | `_drawLemniscate` (bezier figure-8) |
| split vinculum | — | `fillRect` bar |

## Pets & spells (related — same `drawGlyphBody` path)

Not changed in this pass, but flagged for the same reason:

| Source | Glyph | Code point | Risk | Notes |
|--------|-------|-----------|------|-------|
| pet slow | `½` | U+00BD | Low | Latin-1 |
| pet fast / spell | `→` | U+2192 | Low–Med | Arrows block but near-universal (unlike `↻`) |
| pet heavy | `×` | U+00D7 | Low | Latin-1 |
| spell e^x | `eˣ` | U+0065 + **U+02E3** (MODIFIER LETTER SMALL X) | **Medium** | Superscript x is spotty in monospace; candidate for path/manual superscript |
| spell delta | `δ` | U+03B4 | Low | Greek |

The notable watch item outside enemies is **`eˣ` (U+02E3)** — if a tofu box
appears on the e^x spell on non-Windows, this is why.

## Recommendation beyond this pass

The curated safe set keeps things working on fallback fonts today. To make the
intended *look* (math-typeset symbols) guaranteed rather than fallback-
dependent, **bundle a single math webfont** (e.g. STIX Two Math or
KaTeX_Main as a self-hosted `@font-face`) and put it first in
`GLYPH_BODY_FONT_STACK`. That would also let the safe set relax. Until then,
keep risky symbols path-drawn and let `glyph-fallback-safety.test.ts` enforce
the boundary.
