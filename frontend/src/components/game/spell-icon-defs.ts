// HUD-layer presentation for spell buttons. Kept separate from
// `data/spell-defs.ts` so the in-canvas VFX colour (which the SpellEffectRenderer
// owns, tuned against the playfield) stays decoupled from the muted Morandi
// stroke colour used by the HUD chrome.
//
// The `glyph` per spell is the same math symbol the SpellEffectRenderer paints
// on the playfield and the manual lists in its glyph column — button, cast VFX,
// and manual now show one operator per spell (Spell concept-rename, 2026-05-29):
// Exponential `eˣ` / Asymptote `→0` / Impulse `δ` / Acceleration `dv/dt`.
export interface SpellIconDef {
  color: string
  glyph: string
  // Glyph strings differ in length (1 char `δ` vs 5-char `dv/dt`), so each
  // carries its own font size (in the 0–32 SVG user space) to stay balanced in
  // the button. Not a CSS `font-size` declaration — `no-raw-px` does not apply.
  fontSize: number
}

export const SPELL_ICON_DEFS: Record<string, SpellIconDef> = {
  fireball: {
    color: '#C97A5A',
    glyph: 'eˣ',
    fontSize: 18,
  },
  slow: {
    color: '#8AB4CF',
    glyph: '→0',
    fontSize: 15,
  },
  lightning: {
    color: '#C9B86A',
    glyph: 'δ',
    fontSize: 20,
  },
  haste: {
    color: '#9CCDAE',
    glyph: 'dv/dt',
    fontSize: 13,
  },
}

const FALLBACK: SpellIconDef = { color: '#6F6A65', glyph: '?', fontSize: 18 }

export function getSpellIconDef(spellId: string): SpellIconDef {
  return SPELL_ICON_DEFS[spellId] ?? FALLBACK
}
