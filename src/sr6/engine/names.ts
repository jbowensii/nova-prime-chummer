// Leaf helpers the SR6 engine's modules share (no runtime imports): data, categories, grades, effects, levels and load read
// these without importing one another.
import type { Sr6Kind } from '../model/types'

/** As the importer's norm() (importer/sr6/regroup.py): accents and quotes dropped, & as "and", punctuation as spaces,
 *  lower case, no leading "the". */
export function normName(name: string): string {
  const s = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/['‘’"“”]/g, '')
  const out = s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ')
  return out.startsWith('the ') ? out.slice(4) : out
}

/** An entry's key across kinds (catalog.original, .moved, .levels). */
export const entryKey = (kind: Sr6Kind, id: string) => `${kind}/${id}`
