import { evalFormula, formulaOf, type Formula, type Vars } from '../../shared/formula'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from '../model/types'

// Reads the values the SR6 catalog keeps as printed text (prices, availability, ratings, attack bands) and works them out
// as numbers at a rating: rated(), formula(), legality(), ratingRange(), attackRatings() and bookValue() (a <formula>, else the
// printed string).
// Book values as the SR6 catalog keeps them (strings, as printed: "Rating × 500", "5(L)", "9/7/—/—/—") read as numbers.
// Never NaN: a value the app can't read is { n: null, ok: false } and the caller counts it 0 and warns.

/** Longer than any printed value: not read (NONE and LEGAL backtrack quadratically on a long run of spaces, and a runner
 *  file's snapshot or a catalog edit can hold anything; a list of runners prices every line). */
const MAX_VALUE = 100
/** No value printed: a dash or nothing. */
const NONE = /^\s*[—–-]?\s*$/
/** An availability's legality suffix: (L), (I), (F) or a bare L/I/F at the end. */
const LEGAL = /\s*(?:\(([LIF])\)|([LIF]))\s*$/
/** A unit price's word: `1,500 each` is the price of one. */
const EACH = /\s+each\s*$/i

/** The value at `rating`: a number, `Rating`, `Rating × N`, `N × Rating`, `(Rating × N) + M`, `Rating + M`, `+N` (an
 *  add-on), `Rating^2 × N`, `(Rating/3)`; `×`, `x` and `*` all multiply, `/` divides and rounds up (R); `Capacity`,
 *  `Force` and `Level` (any case) are the rating too (what the item is bought at); a unit price's `each` and a legality suffix are ignored (see
 *  legality). The importer's readable() (importer/sr6/recipes/crb.py) accepts the same values. */
export function rated(s: string | undefined, rating = 1): { n: number | null; ok: boolean } {
  if (s == null) return { n: null, ok: true }
  if (s.length > MAX_VALUE) return { n: null, ok: false }
  if (NONE.test(s)) return { n: null, ok: true }
  const src = s
    .replace(EACH, '')
    .replace(LEGAL, '')
    .replace(/^\s*\+/, '')
    .replace(/[×x*]/g, ' * ')
    .replace(/\b(?:rating|capacity|force|level)\b/gi, ' R ')
    .trim()
  const tokens = src.split(/\s*([*/^+()])\s*|\s+/).filter(Boolean)
  // `300/350` is two prices (two items), not a division: only a formula with the rating divides
  if (tokens.includes('/') && !tokens.includes('R')) return { n: null, ok: false }
  let i = 0
  // expr = term ('+' term)*; term = power (('*' | '/') power)*; power = factor ('^' factor)*; factor = number | R | '(' expr ')'
  const factor = (): number => {
    const t = tokens[i++]
    if (t === 'R') return rating
    if (t === '(') {
      const v = expr()
      if (tokens[i++] !== ')') return NaN
      return v
    }
    return t !== undefined && /^(\d+(\.\d+)?|\.\d+)$/.test(t) ? Number(t) : NaN
  }
  const power = (): number => {
    let v = factor()
    while (tokens[i] === '^') {
      i++
      v = v ** factor()
    }
    return v
  }
  const term = (): number => {
    let v = power()
    while (tokens[i] === '*' || tokens[i] === '/') v = tokens[i++] === '*' ? v * power() : Math.ceil(v / power())
    return v
  }
  const expr = (): number => {
    let v = term()
    while (tokens[i] === '+') {
      i++
      v += term()
    }
    return v
  }
  const n = expr()
  return i === tokens.length && Number.isFinite(n) ? { n, ok: true } : { n: null, ok: false }
}

/** An armor's Social modifier as printed (`+2`, `–4`, `Rating`, a dash) at `rating`: a number, else null (none printed, or
 *  a value the app can't read). The book prints minus as an en dash. */
export function armorSocial(s: string | undefined, rating = 1): number | null {
  const m = s?.match(/^\s*([-–−]?)\s*(.*)$/),
    v = m ? rated(m[2], rating).n : null
  return v === null ? null : m![1] ? -v : v
}

/** A spirit's or sprite's stat at its Force or Level: numbers, the letter (or `Rating`), `+ - × x * /` and parentheses,
 *  × and / before + and -; division rounds up (as the book's condition monitors do, CRB p. 38); a trailing `+ ND6`
 *  comes back as `dice`; an en dash is a minus and square brackets are parentheses. A dash or nothing is no value;
 *  anything else is not ok (never NaN). */
export function formula(s: string | undefined, rating: number, letter: 'F' | 'L'): { n: number | null; dice?: string; ok: boolean } {
  if (s == null) return { n: null, ok: true }
  if (s.length > MAX_VALUE) return { n: null, ok: false }
  if (NONE.test(s)) return { n: null, ok: true }
  const m = s.match(/^(.*?)\s*\+\s*(\d+)D6\s*$/)
  // the book prints minus as an en dash (`F–2`) and nests brackets (`[(F x 2) + 4] + 2D6`)
  const src = (m ? m[1] : s)
    .replace(/[–−]/g, '-')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/[×x*]/g, ' * ')
    .replace(new RegExp(`\\b(?:Rating|${letter})\\b`, 'g'), ' R ')
    .trim()
  const tokens = src.split(/\s*([*/+\-()])\s*|\s+/).filter(Boolean)
  let i = 0
  const factor = (): number => {
    const t = tokens[i++]
    if (t === 'R') return rating
    if (t === '(') {
      const v = expr()
      if (tokens[i++] !== ')') return NaN
      return v
    }
    return t !== undefined && /^(\d+(\.\d+)?|\.\d+)$/.test(t) ? Number(t) : NaN
  }
  const term = (): number => {
    let v = factor()
    while (tokens[i] === '*' || tokens[i] === '/') v = tokens[i++] === '*' ? v * factor() : Math.ceil(v / factor())
    return v
  }
  const expr = (): number => {
    let v = term()
    while (tokens[i] === '+' || tokens[i] === '-') v = tokens[i++] === '+' ? v + term() : v - term()
    return v
  }
  const n = expr()
  if (i !== tokens.length || !Number.isFinite(n)) return { n: null, ok: false }
  return m ? { n, dice: `${m[2]}D6`, ok: true } : { n, ok: true }
}

/** A licence fee in an availability: `15,000¥` alone, or after the rating: `2, 15,000¥` (group 1, group 2 the fee). */
const LICENCE = /^\s*(?:(.+?)\s*,\s+)?(\d{1,3}(?:,\d{3})+|\d+)\s*¥\s*$/

/** An availability as printed: a pure nuyen price (`15,000¥`) is a licence: freely available (n 0) with that fee; `2, 15,000¥`
 *  is rating 2 plus the fee; anything else reads as rated() does. ok is false for a value the app can't read.
 *  (SR6 only: Anarchy has no availability.) */
export function availability(s: string | undefined, rating = 1): { n: number | null; fee?: number; ok: boolean } {
  const m = s && s.length <= MAX_VALUE ? s.match(LICENCE) : null
  if (!m) return rated(s, rating)
  const fee = Number(m[2].replace(/,/g, ''))
  const base = m[1] === undefined ? { n: 0, ok: true } : rated(m[1], rating)
  return base.ok ? { n: base.n, fee, ok: true } : { n: null, ok: false }
}

/** The legality letter of an availability ("5(L)" → L; "2(L), 15,000¥" → L), or none. */
export function legality(s: string | undefined): 'L' | 'I' | 'F' | undefined {
  const m = s && s.length <= MAX_VALUE ? s.replace(/\s*,\s*\d[\d,]*\s*¥\s*$/, '').match(LEGAL) : null
  return (m?.[1] ?? m?.[2]) as 'L' | 'I' | 'F' | undefined
}

/** How an availability is listed, and the heads-up it earns (never a refusal: licences and legality are a conversation with
 *  the GM, and a player may carry the item unlicensed and take what comes). `text`: the licence in words, when it prints one;
 *  `warn`: a note for an item needing a licence or of restricted legality (L, I, F). `licence`: the owned line's choice
 *  (Sr6Purchase.licence): bought, the item is licensed (no warning); unlicensed, the warning says it is carried without. */
export function availNote(avail: string | undefined, rating = 1, licence?: 'bought' | 'unlicensed'): { text?: string; warn?: string } {
  const a = availability(avail, rating)
  const letter = legality(avail)
  if (!a.ok || a.fee === undefined) return { warn: letter ? `Legality ${letter}: licences and legality are for your GM; not enforced here.` : undefined }
  const money = `${a.fee.toLocaleString('en-US')}¥`
  const pure = avail!.match(LICENCE)?.[1] === undefined // (nothing but the fee: freely available; `2, 500¥` is rating 2 and a fee)
  const text = pure ? `available with licence (fee ${money})` : `${a.n}${letter ? `(${letter})` : ''}, licence fee ${money}`
  if (licence === 'bought') return { text: `${text} · licensed` }
  return {
    text,
    warn:
      licence === 'unlicensed'
        ? `Carried without a licence (fee ${money} not paid); settle it with your GM.`
        : `Needs a licence (fee ${money}) — or carry it unlicensed; settle it with your GM.`,
  }
}

/** The highest rating or level the app reads. ponytail: no book prints one near it; a file's `1-20000000` would build
 *  that many ratings (or levels) on every render. Raise it if a book ever prints more. */
export const MAX_RATING = 100
/** The ratings an item comes in: "1–3" → [1, 2, 3], "6" → [6], a dash, nothing, one above MAX_RATING or anything else
 *  → [] (the catalog warns of one past MAX_RATING: data.ts). */
export function ratingRange(s: string | undefined): number[] {
  const m = s?.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?$/)
  if (!m) return []
  const lo = Number(m[1]),
    hi = Number(m[2] ?? m[1])
  if (hi > MAX_RATING) return []
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, k) => lo + k)
}

/** How an entry priced per rating with no rating range printed is bought (a focus's `Force × 4,000¥`, a cyberlimb
 *  add-on's `[Rating]`): at a rating the player picks, 1 or more, named as the book names it ('Force' or 'Rating');
 *  undefined for an entry that comes in a printed range or isn't rated. Its bounds are the book's rules elsewhere (a
 *  focus's Force not above Magic, an add-on's capacity within its host's: Review's catalog.capacity). */
export function chosenRating(e: Sr6Entry | undefined): 'Force' | 'Rating' | undefined {
  if (!e || ratingRange(e.attrs.rating).length) return undefined
  const printed = ['cost', 'avail', 'essence', 'capacity', 'karma'].map(k => e.attrs[k] ?? '').join(' ')
  if (!/\b(?:rating|force)\b/i.test(printed) && !(e.formulas ?? []).some(f => /\bR\b/.test(f.expr))) return undefined
  return /\bforce\b/i.test(printed) ? 'Force' : 'Rating'
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
    if (!/^\s*\d+\s*$/.test(p)) {
      ok = false
      return null
    }
    return Number(p)
  })
  return { bands, ok }
}

/** Finds a catalog entry by kind and id (a formula's ref()); undefined for a kind or id the catalog doesn't have. */
export type Find = (kind: string, id: string) => Sr6Entry | undefined
/** As Find, over the engine's catalog view. */
export const dataFind =
  (data: { entry(kind: Sr6Kind, id: string): Sr6Entry | undefined }): Find =>
  (kind, id) =>
    Object.hasOwn(SR6_KINDS, kind) ? data.entry(kind as Sr6Kind, id) : undefined
/** A field's value: n null when there is none (ok) or the app can't work it out (not ok, error says why for a formula).
 *  formula: the entry's formula for the field; notes: what it had to assume; perLine: the formula counts the quantity. */
export interface BookValue {
  n: number | null
  ok: boolean
  formula?: Formula
  notes: string[]
  error?: string
  perLine?: boolean
}

/** "1,000¥" → "1000": a printed value as rated() reads it */
const plain = (s: string | undefined) => s?.replace(/¥/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1')

/** A field of entry `e` at `rating`: its <formula> when it has one (B: the printed value, Q, M and opt.<id> from `vars`),
 *  else the printed value read by rated() (an absent rating reads as 1). A ref() looks up `find`; one that finds nothing
 *  leaves the value unworked (n null, not ok), never 0. */
export function bookValue(e: Sr6Entry | undefined, field: string, rating?: number, find?: Find, vars: Omit<Vars, 'R' | 'B'> = {}, depth = 0): BookValue {
  const raw = e?.attrs[field],
    f = formulaOf(e?.formulas, field)
  if (!f) {
    const v = field === 'avail' ? availability(raw, rating ?? 1) : rated(raw, rating ?? 1)
    return { n: v.n, ok: v.ok, notes: [] }
  }
  if (depth > 8) return { n: null, ok: false, formula: f, notes: [], error: 'its refs go round in a circle' }
  const printed = rated(plain(raw), rating ?? 1)
  const r = evalFormula(
    f,
    { ...vars, R: rating, B: printed.ok ? printed.n : null },
    (kind, id, fld, at) => bookValue(find?.(kind, id), fld, at, find, {}, depth + 1).n,
  )
  return { n: r.n, ok: r.n !== null, formula: f, notes: r.notes, ...(r.error ? { error: r.error } : {}), ...(r.usesQ ? { perLine: true } : {}) }
}

/** A formula's values over the ratings the entry comes in (just one without a rating range): [lowest, highest], or null
 *  when it can't be worked out at one of them. */
export function formulaRange(e: Sr6Entry, field: string, find?: Find): [number, number] | null {
  const rs = ratingRange(e.attrs.rating)
  const ns = (rs.length ? rs : [undefined]).map(r => bookValue(e, field, r, find).n)
  if (ns.some(n => n === null)) return null
  return [Math.min(...(ns as number[])), Math.max(...(ns as number[]))]
}
