// Book formulas and data issues, both games (docs/sr6-data-format/formulas-and-issues.md and docs/data-format.md, "Formulas and issues").
// A catalog entry may carry <formula field="cost" round="up">R * 200</formula>: how the field is worked out, beside the
// value as printed; and <issue field="avail" code="missing" page="91">note</issue>: a field the book prints nothing for,
// or something the importer couldn't read. The formula is read here by a small parser (never eval):
//   numbers, + - * / (× too), parentheses, unary minus;
//   R (rating), Q (quantity), M (Magic), B (this field's printed value), opt.<id> (an option);
//   tier(R; 1-3: a; 4-6: b; 7+: c), ref(kind:id, field[, R]), ceil, floor, min, max (arguments split by commas).
// A variable the caller doesn't give counts as 1 and leaves a note; a ref to an entry or value that isn't there (or a
// formula that can't be read) gives no number at all, never 0.

export interface Formula {
  field: string
  expr: string
  round?: 'up' | 'down'
  unit?: string
  qty?: string
}
export type IssueCode = 'missing' | 'unreadable' | 'ambiguous'
export interface Issue {
  field: string
  code: IssueCode
  page?: number
  note: string
}
export interface Vars {
  R?: number
  Q?: number
  M?: number
  B?: number | null
  H?: number | null
  opt?: Record<string, number>
}
/** Another entry's value (ref): its number at `rating`, or null when the entry or its value isn't there. */
export type RefLookup = (kind: string, id: string, field: string, rating: number | undefined) => number | null
/** n: null when the formula can't be worked out (error says why). usesQ: it works out the whole line (× quantity inside). */
export interface FormulaResult {
  n: number | null
  notes: string[]
  error?: string
  usesQ: boolean
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: 'R' | 'Q' | 'M' | 'B' | 'H' }
  | { t: 'opt'; id: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { t: 'fn'; fn: 'ceil' | 'floor' | 'min' | 'max'; args: Node[] }
  | { t: 'tier'; x: Node; cases: { lo: number; hi: number; v: Node }[] }
  | { t: 'ref'; kind: string; id: string; field: string; r?: Node }

const MAX_LEN = 500,
  MAX_DEPTH = 40
const FNS = { ceil: 1, floor: 1, min: 2, max: 2 } as const

/** The formula's syntax tree; throws (a message for the user) when it can't be read. */
export function parseFormula(src: string): Node {
  if (src.length > MAX_LEN) throw new Error('the formula is too long')
  const s = src.replace(/×/g, '*').replace(/[–−]/g, '-')
  let i = 0,
    depth = 0
  const ws = () => {
    while (/\s/.test(s[i] ?? '')) i++
  }
  const peek = () => {
    ws()
    return s[i]
  }
  const eat = (c: string) => {
    if (peek() !== c) throw new Error(`expected “${c}” at ${i + 1}`)
    i++
  }
  const int = () => {
    ws()
    const m = /^\d+/.exec(s.slice(i))
    if (!m) throw new Error(`expected a whole number at ${i + 1}`)
    i += m[0].length
    return Number(m[0])
  }
  /** raw text up to the next , or ) at this level */
  const raw = () => {
    ws()
    const m = /^[^,)]*/.exec(s.slice(i))!
    i += m[0].length
    return m[0].trim()
  }

  const expr = (): Node => {
    if (++depth > MAX_DEPTH) throw new Error('the formula nests too deeply')
    let a = term()
    for (let c = peek(); c === '+' || c === '-'; c = peek()) {
      i++
      a = { t: 'bin', op: c, a, b: term() }
    }
    depth--
    return a
  }
  const term = (): Node => {
    let a = unary()
    for (let c = peek(); c === '*' || c === '/'; c = peek()) {
      i++
      a = { t: 'bin', op: c, a, b: unary() }
    }
    return a
  }
  const unary = (): Node => {
    if (peek() === '-') {
      i++
      return { t: 'neg', a: unary() }
    }
    return primary()
  }
  const primary = (): Node => {
    const c = peek()
    if (c === '(') {
      i++
      const v = expr()
      eat(')')
      return v
    }
    const num = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i))
    if (num) {
      i += num[0].length
      return { t: 'num', v: Number(num[0]) }
    }
    const id = /^[A-Za-z][A-Za-z0-9_]*/.exec(s.slice(i))
    if (!id) throw new Error(c === undefined ? 'the formula ends too soon' : `can’t read “${c}” at ${i + 1}`)
    i += id[0].length
    const name = id[0]
    if (name === 'opt' && s[i] === '.') {
      // an option's id: lower case, digits, dots, and dashes followed by a letter (opt.x-1 is opt.x minus 1)
      const m = /^\.([a-z0-9_.]+(?:-[a-z][a-z0-9_.]*)*)/.exec(s.slice(i))
      if (!m) throw new Error(`an option needs its id (opt.<id>) at ${i + 1}`)
      i += m[0].length
      return { t: 'opt', id: m[1] }
    }
    if (name === 'R' || name === 'Q' || name === 'M' || name === 'B' || name === 'H') return { t: 'var', name }
    if (name === 'tier') {
      eat('(')
      const x = expr(),
        cases: { lo: number; hi: number; v: Node }[] = []
      while (peek() === ';') {
        i++
        const lo = int()
        let hi = lo
        if (peek() === '-') {
          i++
          hi = int()
        } else if (peek() === '+') {
          i++
          hi = Infinity
        }
        eat(':')
        cases.push({ lo, hi, v: expr() })
      }
      eat(')')
      if (!cases.length) throw new Error('tier() needs at least one “from-to: value”')
      return { t: 'tier', x, cases }
    }
    if (name === 'ref') {
      eat('(')
      const target = /^([a-z]+):([a-z0-9][a-z0-9.-]*)$/.exec(raw())
      if (!target) throw new Error('ref() starts with kind:id')
      eat(',')
      const field = raw()
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(field)) throw new Error('ref() needs a field name second')
      let r: Node | undefined
      if (peek() === ',') {
        i++
        r = expr()
      }
      eat(')')
      return { t: 'ref', kind: target[1], id: target[2], field, r }
    }
    if (Object.hasOwn(FNS, name)) {
      const fn = name as keyof typeof FNS
      eat('(')
      const args = [expr()]
      while (peek() === ',') {
        i++
        args.push(expr())
      }
      eat(')')
      if (fn === 'ceil' || fn === 'floor' ? args.length !== 1 : args.length < 2)
        throw new Error(`${fn}() takes ${FNS[fn] === 1 ? 'one value' : 'two or more values'}`)
      return { t: 'fn', fn, args }
    }
    throw new Error(`unknown name “${name}”`)
  }

  const tree = expr()
  if (peek() !== undefined) throw new Error(`can’t read “${s.slice(i)}”`)
  return tree
}

const uses = (n: Node, name: string): boolean => {
  switch (n.t) {
    case 'var':
      return n.name === name
    case 'neg':
      return uses(n.a, name)
    case 'bin':
      return uses(n.a, name) || uses(n.b, name)
    case 'fn':
      return n.args.some(a => uses(a, name))
    case 'tier':
      return uses(n.x, name) || n.cases.some(c => uses(c.v, name))
    case 'ref':
      return !!n.r && uses(n.r, name)
    default:
      return false
  }
}

const MISSING: Record<'R' | 'Q' | 'M' | 'B' | 'H', string> = {
  R: 'no rating given: worked out at rating 1',
  Q: 'no quantity given: worked out for 1',
  M: 'no Magic given: worked out at Magic 1',
  B: 'no printed value: worked out with 1',
  H: 'not fitted to an item: worked out with 1 (its price is a multiple of the item it goes on)',
}
class Unpriced extends Error {}

/** The formula's value: rounded up (round="up", the default) or down to a whole number, Essence to two decimals. */
export function evalFormula(f: Formula, vars: Vars, ref?: RefLookup): FormulaResult {
  let tree: Node
  try {
    tree = parseFormula(f.expr)
  } catch (e) {
    return { n: null, notes: [], error: `can’t read the formula “${f.expr}”: ${(e as Error).message}`, usesQ: false }
  }
  const notes = new Set<string>()
  const val = (k: 'R' | 'Q' | 'M' | 'B' | 'H') => {
    const v = vars[k]
    if (v == null) {
      notes.add(MISSING[k])
      return 1
    }
    return v
  }
  const ev = (n: Node): number => {
    switch (n.t) {
      case 'num':
        return n.v
      case 'var':
        return val(n.name)
      case 'opt': {
        const v = vars.opt?.[n.id]
        if (v == null) {
          notes.add(`option ${n.id} not given: counted as 1`)
          return 1
        }
        return v
      }
      case 'neg':
        return -ev(n.a)
      case 'bin': {
        const a = ev(n.a),
          b = ev(n.b)
        if (n.op === '/' && b === 0) throw new Unpriced('it divides by zero')
        return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b
      }
      case 'fn': {
        const xs = n.args.map(ev)
        return n.fn === 'ceil' ? Math.ceil(xs[0] - 1e-9) : n.fn === 'floor' ? Math.floor(xs[0] + 1e-9) : n.fn === 'min' ? Math.min(...xs) : Math.max(...xs)
      }
      case 'tier': {
        const x = ev(n.x),
          hit = n.cases.find(c => x >= c.lo && x <= c.hi)
        if (!hit) throw new Unpriced(`tier() has no value for ${x}`)
        return ev(hit.v)
      }
      case 'ref': {
        const r = n.r ? ev(n.r) : vars.R
        const v = ref?.(n.kind, n.id, n.field, r) ?? null
        if (v === null) throw new Unpriced(`it refers to ${n.kind}:${n.id}’s ${n.field}, which isn’t in the catalog`)
        return v
      }
    }
  }
  try {
    const x = ev(tree)
    if (!Number.isFinite(x)) return { n: null, notes: [...notes], error: 'it doesn’t work out to a number', usesQ: uses(tree, 'Q') }
    const n = f.field === 'essence' ? Math.round(x * 100) / 100 : f.round === 'down' ? Math.floor(x + 1e-9) : Math.ceil(x - 1e-9)
    return { n: Object.is(n, -0) ? 0 : n, notes: [...notes], usesQ: uses(tree, 'Q') }
  } catch (e) {
    if (e instanceof Unpriced) return { n: null, notes: [...notes], error: e.message, usesQ: false }
    throw e
  }
}

/** A formula as people read it: "Rating × 200¥", "tier(Rating; 1-3: 2; 4-6: 4)", "… per 10 rounds". `base`: what B
 *  stands for (the printed value, a standard price), shown in its place. */
export function formulaText(f: Formula, base?: string): string {
  const words: Record<string, string> = { R: 'Rating', Q: 'Quantity', M: 'Magic', B: base ?? 'Printed value', H: 'The item it goes on' }
  const body = f.expr
    .replace(/\b[RQMBH]\b/g, v => words[v])
    .replace(/\s*\*\s*/g, ' × ')
    .replace(/\s*\/\s*/g, ' ÷ ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${body}${f.field === 'cost' ? '¥' : ''}${f.unit ? ` per ${f.qty ? `${f.qty} ` : ''}${f.unit}` : ''}`
}

/** A catalog field as a sentence names it. */
export const FIELD_NAMES: Record<string, string> = {
  avail: 'availability',
  cost: 'cost',
  rating: 'rating',
  ammo: 'ammo',
  essence: 'Essence',
  capacity: 'capacity',
  dv: 'damage',
  ar: 'attack ratings',
  armor: 'armor',
  defense: 'Defense Rating',
  karma: 'karma cost',
  printedRating: 'rating',
}
export const fieldName = (f: string) => FIELD_NAMES[f] ?? f
/** What the book has for the field: "none printed", "unreadable", "ambiguous". */
export const ISSUE_BOOK: Record<IssueCode, string> = { missing: 'none printed', unreadable: 'unreadable', ambiguous: 'ambiguous' }

/** Review's note for a runner that uses an entry with an issue (cited with the issue's page). */
export function issueNote(name: string, x: Issue): string {
  const f = fieldName(x.field)
  const what =
    x.code === 'missing' ? `the book prints no ${f}` : x.code === 'unreadable' ? `the app can’t read the book’s ${f}` : `the book’s ${f} is ambiguous`
  return `${name}: ${what}, set it in Game data or an override file.`
}

const CODES = new Set<string>(['missing', 'unreadable', 'ambiguous'])
/** An entry's <formula> and <issue> children (direct ones only). A malformed one is kept as an issue, never dropped quietly. */
export function readFormulasAndIssues(el: Element): { formulas: Formula[]; issues: Issue[] } {
  const formulas: Formula[] = [],
    issues: Issue[] = []
  for (const k of el.children) {
    const field = k.getAttribute('field') ?? ''
    if (k.localName === 'formula') {
      const round = k.getAttribute('round')
      formulas.push({
        field,
        expr: (k.textContent ?? '').trim(),
        ...(round === 'down' || round === 'up' ? { round } : {}),
        ...(k.getAttribute('unit') ? { unit: k.getAttribute('unit')! } : {}),
        ...(k.getAttribute('qty') ? { qty: k.getAttribute('qty')! } : {}),
      })
    } else if (k.localName === 'issue') {
      const code = k.getAttribute('code') ?? '',
        page = Number(k.getAttribute('page')) || undefined
      // a "missing" issue for a field the entry has a value for is stale — an override or default supplied it (the importer
      // drops it on reimport; this covers data that still carries both). Skip it so it never reaches Review or Game data.
      if (code === 'missing' && (el.getAttribute(field) ?? '').trim()) continue
      issues.push({ field, code: CODES.has(code) ? (code as IssueCode) : 'unreadable', ...(page ? { page } : {}), note: (k.textContent ?? '').trim() })
    }
  }
  return { formulas, issues }
}

/** The formula of `field`, if the entry has one. */
export const formulaOf = (formulas: Formula[] | undefined, field: string) => formulas?.find(f => f.field === field)

/** An edit's issues: the book's, except for the fields the edit sets otherwise (`changed`). */
export const openIssues = (book: Issue[] | undefined, changed: (field: string) => boolean) => book?.filter(x => !changed(x.field))

/** Formula elements as the data files write them (an edit or a snapshot keeps its entry's formulas). */
export const formulaXml = (fs: Formula[] | undefined, esc: (s: string) => string) =>
  (fs ?? [])
    .map(
      f =>
        `<formula field="${esc(f.field)}"${f.round ? ` round="${f.round}"` : ''}${f.unit ? ` unit="${esc(f.unit)}"` : ''}${f.qty ? ` qty="${esc(f.qty)}"` : ''}>${esc(f.expr)}</formula>`,
    )
    .join('')
