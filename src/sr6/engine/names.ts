// Leaf helpers the SR6 engine's modules share (no runtime imports): data, categories, grades, effects, levels and load read
// these without importing one another.
import type { Sr6Kind } from '../model/types'

/** As the importer's norm() (importer/sr6/regroup.py): accents and quotes dropped, & as "and", punctuation as spaces,
 *  lower case, no leading "the". */
export function normName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’"“”]/g, '')
  const out = s
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  return out.startsWith('the ') ? out.slice(4) : out
}

/** A printed name as a loose match key: normName without its bracketed notes (`(+4)`, `[rating 2]`), its rating or
 *  level (`R3`, `Rating 4`, a trailing number) and plural endings (a word longer than 3 loses a final `s`, not `ss`, or
 *  `es` after `x`, `ch`, `sh`: `Fists` is `fist`, `Boxes` `box`). */
export function matchKey(name: string): string {
  const s = normName(
    name
      .replace(/\([^()]*\)|\[[^[\]]*\]/g, ' ')
      .replace(/\b(?:r|rating|level)\s*\d+\b/gi, ' ')
      .replace(/\s\d{1,2}\s*$/, ' '),
  )
  return s
    .split(' ')
    .map(w => (w.length > 3 && /(?:x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w))
    .join(' ')
}
/** How alike two strings are, 0–1: Ratcliff/Obershelp, 2 × matched characters / both lengths (the importer's
 *  difflib.SequenceMatcher ratio for names this short). Past 200 characters: 0 unless equal. */
export function nameRatio(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length || a.length > 200 || b.length > 200) return 0
  const matched = (i0: number, i1: number, j0: number, j1: number): number => {
    // the longest common run in a[i0..i1) and b[j0..j1), then the same either side of it
    let best = 0,
      bi = 0,
      bj = 0
    let prev = new Array<number>(j1 - j0 + 1).fill(0)
    for (let i = i0; i < i1; i++) {
      const row = new Array<number>(j1 - j0 + 1).fill(0)
      for (let j = j0; j < j1; j++) {
        const run = a[i] === b[j] ? prev[j - j0] + 1 : 0
        row[j - j0 + 1] = run
        if (run > best) {
          best = run
          bi = i + 1 - run
          bj = j + 1 - run
        }
      }
      prev = row
    }
    return best ? best + matched(i0, bi, j0, bj) + matched(bi + best, i1, bj + best, j1) : 0
  }
  return (2 * matched(0, a.length, 0, b.length)) / (a.length + b.length)
}
/** An upper bound of nameRatio from the characters alone (difflib's quick_ratio): cheap, to skip what can't reach a
 *  threshold. */
export function quickRatio(a: string, b: string): number {
  const n = new Map<string, number>()
  for (const ch of a) n.set(ch, (n.get(ch) ?? 0) + 1)
  let common = 0
  for (const ch of b) {
    const k = n.get(ch) ?? 0
    if (k > 0) {
      common++
      n.set(ch, k - 1)
    }
  }
  return a.length + b.length ? (2 * common) / (a.length + b.length) : 1
}

/** An entry's key across kinds (catalog.original, .moved, .levels). */
export const entryKey = (kind: Sr6Kind, id: string) => `${kind}/${id}`
