// Book values as the SR6 catalog keeps them (strings, as printed: "Rating × 500", "5(L)", "9/7/—/—/—") read as numbers.
// Never NaN: a value the app can't read is { n: null, ok: false } and the caller counts it 0 and warns.

/** Longer than any printed value: not read (NONE and LEGAL backtrack quadratically on a long run of spaces, and a runner
 *  file's snapshot or a catalog edit can hold anything; a list of runners prices every line). */
const MAX_VALUE = 100
/** No value printed: a dash or nothing. */
const NONE = /^\s*[—–-]?\s*$/
/** An availability's legality suffix: (L), (I), (F) or a bare L/I/F at the end. */
const LEGAL = /\s*(?:\(([LIF])\)|([LIF]))\s*$/

/** The value at `rating`: a number, `Rating`, `Rating × N`, `N × Rating`, `(Rating × N) + M`, `Rating + M`, `+N` (an
 *  add-on); `×`, `x` and `*` all multiply; a legality suffix is ignored (see legality). */
export function rated(s: string | undefined, rating = 1): { n: number | null; ok: boolean } {
  if (s == null) return { n: null, ok: true }
  if (s.length > MAX_VALUE) return { n: null, ok: false }
  if (NONE.test(s)) return { n: null, ok: true }
  const src = s.replace(LEGAL, '').replace(/^\s*\+/, '').replace(/[×x*]/g, ' * ').replace(/Rating/g, ' R ').trim()
  const tokens = src.split(/\s*([*+()])\s*|\s+/).filter(Boolean)
  let i = 0
  // expr = term ('+' term)*; term = factor ('*' factor)*; factor = number | R | '(' expr ')'
  const factor = (): number => {
    const t = tokens[i++]
    if (t === 'R') return rating
    if (t === '(') { const v = expr(); if (tokens[i++] !== ')') return NaN; return v }
    return t !== undefined && /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
  }
  const term = (): number => { let v = factor(); while (tokens[i] === '*') { i++; v *= factor() } return v }
  const expr = (): number => { let v = term(); while (tokens[i] === '+') { i++; v += term() } return v }
  const n = expr()
  return i === tokens.length && Number.isFinite(n) ? { n, ok: true } : { n: null, ok: false }
}

/** The legality letter of an availability ("5(L)" → L), or none. */
export function legality(s: string | undefined): 'L' | 'I' | 'F' | undefined {
  const m = s && s.length <= MAX_VALUE ? s.match(LEGAL) : null
  return (m?.[1] ?? m?.[2]) as 'L' | 'I' | 'F' | undefined
}

/** The ratings an item comes in: "1–3" → [1, 2, 3], "6" → [6], a dash, nothing or anything else → []. */
export function ratingRange(s: string | undefined): number[] {
  const m = s?.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?$/)
  if (!m) return []
  const lo = Number(m[1]), hi = Number(m[2] ?? m[1])
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, k) => lo + k)
}

/** A weapon's attack ratings, five range bands split on "/": a dash or a missing band is null; a band the app can't
 *  read is null and makes ok false. */
export function attackRatings(s: string | undefined): { bands: (number | null)[]; ok: boolean } {
  if ((s ?? '').length > MAX_VALUE) return { bands: [null, null, null, null, null], ok: false }
  const parts = (s ?? '').split('/')
  let ok = true
  const bands = Array.from({ length: 5 }, (_, k) => {
    const p = parts[k]
    if (p === undefined || NONE.test(p)) return null
    if (!/^\s*\d+\s*$/.test(p)) { ok = false; return null }
    return Number(p)
  })
  return { bands, ok }
}
