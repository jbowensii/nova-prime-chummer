// Levels (owner, 2026-10-11): an entry the book prints with several levels (DHSA's Freefall "up to level 3", a cyberdeck's
// Attack add-on "+1, max +5") is one catalog entry per level, otherwise duplicates of one another, each with its own
// rating and effects (the importer writes them: importer/recipes/dhsa.py level_range). `family` keeps a family's levels
// together (pickers, the Amp Builder's level step) and is the id the entry had before it was split, which its lowest level
// keeps (owner, 2026-10-11): runners, edits and links made on the old entry stay on it.
import type { AmpTemplate, Catalog } from '../../formats/domain/types'

const cache = new WeakMap<Catalog, Map<string, AmpTemplate[]>>()
const families = (c: Catalog) => {
  let m = cache.get(c)
  if (!m) {
    m = new Map()
    for (const t of c.amps.values()) if (t.family) m.set(t.family, [...(m.get(t.family) ?? []), t])
    for (const list of m.values()) list.sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    cache.set(c, m)
  }
  return m
}

/** A family's levels, lowest first (none for an entry that isn't one). */
export const levelsOf = (c: Catalog, family?: string): AmpTemplate[] => (family && families(c).get(family)) || []

/** A level's name without its level ("Freefall 2" → "Freefall", "Attack +3" → "Attack"); another entry's own name. */
export const familyName = (t: Pick<AmpTemplate, 'name' | 'family'>) => (t.family ? t.name.replace(/\s+[+−-]?\d+$/, '') : t.name)

/** "Level 2 (1–3)": where a level sits in its family, for pickers; undefined for an entry that isn't one. */
export function levelLabel(c: Catalog, t: AmpTemplate): string | undefined {
  const all = levelsOf(c, t.family)
  if (!all.length || t.level == null) return undefined
  const n = (l?: number) => (t.mod && l != null && l > 0 ? `+${l}` : String(l))
  return `Level ${n(t.level)} (${n(all[0].level)}–${n(all[all.length - 1].level)})`
}
