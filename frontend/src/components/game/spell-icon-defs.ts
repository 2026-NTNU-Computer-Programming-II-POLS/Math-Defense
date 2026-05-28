// HUD-layer presentation for spell buttons. Kept separate from
// `data/spell-defs.ts` so the in-canvas VFX colour (which the SpellEffectRenderer
// owns, tuned against the playfield) stays decoupled from the muted Morandi
// stroke colour used by the HUD chrome.
export interface SpellIconDef {
  color: string
  path: string
}

export const SPELL_ICON_DEFS: Record<string, SpellIconDef> = {
  fireball: {
    color: '#C97A5A',
    path: 'M 16 6 L 27 26 L 5 26 Z',
  },
  slow: {
    color: '#8AB4CF',
    // Three lines crossing at the centre at proper 60° hexagonal symmetry.
    path: 'M 16 4 V 28 M 5.6 10 L 26.4 22 M 5.6 22 L 26.4 10',
  },
  lightning: {
    color: '#C9B86A',
    // Mirror-symmetric zigzag: front edge (top tip → notch → bottom tip)
    // and back edge match in length so the bolt reads as a single stroke.
    path: 'M 19 4 L 10 17 L 16 17 L 13 28 L 22 15 L 16 15 Z',
  },
  haste: {
    color: '#9CCDAE',
    // Double chevron centred on x=16 (bbox 8–24).
    path: 'M 8 9 L 15 16 L 8 23 M 17 9 L 24 16 L 17 23',
  },
}

const FALLBACK: SpellIconDef = { color: '#6F6A65', path: '' }

export function getSpellIconDef(spellId: string): SpellIconDef {
  return SPELL_ICON_DEFS[spellId] ?? FALLBACK
}
