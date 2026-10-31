// Starter packs (owner ruling 2026-10-31, option A): buying a pack expands it into its contents as separate, editable lines
// (gear, a SIN with its licences, a lifestyle), charged at the pack's price. The pack's price is the only nuyen it costs:
// every expanded line carries `pack` (the expansion's uid) and is priced 0, so the totals equal the pack's. Undoing the
// pack takes all of them away. The catalog's packs hold their contents as printed text (`<item>`), so each item is read
// (a count, a rating, a SIN, licences, a lifestyle, another pack) and matched to the catalog by name; one the catalog
// doesn't have stays a free line named as printed, never guessed.
import { matchKey, nameRatio, normName } from '../../../catalog/domain/names'
import { newId } from '../../../../core/shared/types'
import type { PurchaseKind, Sr6Build, Sr6PackExpansion, Sr6Purchase, Sr6Sin } from '../../../formats/domain/character'
import { rateLicences } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { bookValue, dataFind, ratingRange } from '../../../catalog/domain/values'
import { STACKING } from '../../../catalog/domain/categories'

export type { Sr6PackExpansion }

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const COUNT = `\\d+|${Object.keys(NUMBER_WORDS).join('|')}`
const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s.toLowerCase()] ?? 1))
// kinds an item is looked up in, in order
const KINDS: PurchaseKind[] = ['gear', 'electronics', 'armor', 'weapons', 'programs', 'augmentations', 'vehicles']
const LICENCE_NAME = 'Fake licence (specify)'

const all = (data: Sr6Data, kind: Sr6Kind) => data.kindEntries?.(kind) ?? []

/** The catalog entry a printed item is, in KINDS: by name, else by loose name (plural, rating), else one at least 0.85 alike;
 *  undefined when none. Ties: the pack's own book. */
function find(data: Sr6Data, name: string, source: string): { kind: PurchaseKind; e: Sr6Entry } | undefined {
  const key = matchKey(name),
    norm = normName(name)
  if (key.length < 3) return undefined
  const pick = (es: Sr6Entry[]) => es.find(e => e.source === source) ?? es[0]
  for (const level of ['exact', 'loose', 'close'] as const)
    for (const kind of KINDS) {
      const es = all(data, kind).filter(e =>
        level === 'exact' ? normName(e.name) === norm : level === 'loose' ? matchKey(e.name) === key : nameRatio(matchKey(e.name), key) >= 0.85,
      )
      if (es.length) return { kind, e: pick(es) }
    }
  return undefined
}

/** One printed item's lines. ponytail: reads the common phrasings of the packs (a leading count, `(rating N)`, a trailing
 *  note), not free prose; an item it can't match is a free custom line named as printed. */
function itemLines(data: Sr6Data, printed: string, source: string): Sr6Purchase[] {
  const text = printed.trim()
  const lead = new RegExp(`^(${COUNT})\\s+(?:x\\s*)?`, 'i').exec(text),
    qty = lead ? count(lead[1]) : 1
  let rest = lead ? text.slice(lead[0].length) : text
  const tail = /\s*\(?\bx\s*(\d+)\)?\s*$/i.exec(rest)
  rest = tail ? rest.slice(0, tail.index) : rest
  const n = tail ? Number(tail[1]) : qty
  const paren = [...rest.matchAll(/\(([^()]*)\)/g)].map(m => m[1])
  const rating = Number(/rating\s+(\d+)/i.exec(paren.join(' '))?.[1]) || undefined
  const name = rest.replace(/\s*\([^()]*\)/g, '').trim()
  const note = paren
    .map(p => p.replace(/rating\s+\d+,?\s*/i, '').trim())
    .filter(Boolean)
    .join('; ')
  const hit = find(data, name, source) ?? find(data, name.replace(/\s+(?:pack|packet)s?$/i, ''), source)
  const mk = (kind: PurchaseKind, extra: Partial<Sr6Purchase>): Sr6Purchase => ({
    uid: newId(),
    kind,
    qty: 1,
    accessories: [],
    ...(note ? { note: note.slice(0, 200) } : {}),
    ...extra,
  })
  const make = (q: number): Sr6Purchase[] => {
    if (!hit) return [mk('gear', { name: text.slice(0, 120), cost: 0, avail: 0, essence: 0, qty: q })]
    const range = ratingRange(hit.e.attrs.rating)
    const r = rating !== undefined && (!range.length || range.includes(rating)) ? rating : undefined
    const stack = STACKING.has(hit.kind)
    return Array.from({ length: stack ? 1 : q }, () =>
      mk(hit.kind, { id: hit.e.id, name: hit.e.name, qty: stack ? q : 1, ...(r !== undefined ? { rating: r } : {}) }),
    )
  }
  return make(n)
}

/** A pack's contents, as lines, SINs and lifestyles (not yet in any build). */
function contents(
  data: Sr6Data,
  pack: Sr6Entry,
  depth: number,
): Pick<Sr6PackExpansion, 'lines' | 'sins'> & { months: { id: string; months: number }[]; licences: number } {
  const out = { lines: [] as Sr6Purchase[], sins: [] as Sr6Sin[], months: [] as { id: string; months: number }[], licences: 0 }
  const lifestyles = all(data, 'lifestyles')
  for (const raw of items(pack)) {
    const t = raw.trim()
    // a fake SIN (`Fake SIN (rating 4)`)
    const sin = /\bSIN\b/.test(t) && !/licen[cs]e/i.test(t) ? t : undefined
    if (sin) {
      out.sins.push({ uid: newId(), name: 'Pack SIN', kind: 'fake', rating: Number(/rating\s+(\d+)/i.exec(sin)?.[1]) || 1, licences: [] })
      continue
    }
    // licences (`two fake licenses (rating 4, specify license)`): on the pack's SIN, to be named by the player
    const lic = new RegExp(`^(${COUNT})\\s+(?:fake\\s+)?licen[cs]es?\\b`, 'i').exec(t) ?? (/^(?:a\s+)?(?:fake\s+)?licen[cs]e\b/i.test(t) ? ['', '1'] : null)
    if (lic) {
      out.licences += count(lic[1])
      continue
    }
    // a lifestyle (`2 months low lifestyle`, `One month Low lifestyle`)
    const life = new RegExp(`^(${COUNT})\\s+months?\\s+([a-z -]+?)\\s+lifestyle\\b`, 'i').exec(t)
    const style = life && lifestyles.find(e => normName(e.name) === normName(life[2]))
    if (life && style) {
      out.months.push({ id: style.id, months: count(life[1]) })
      continue
    }
    // another pack (`Shadowrunner Starter PACK`): its contents too, its price not
    const inner =
      depth > 0 && /\bpack\b/i.test(t) ? all(data, 'packs').find(p => normName(p.name) === normName(t.replace(/\s+(?:pack|packet)s?$/i, ''))) : undefined
    if (inner && inner.id !== pack.id) {
      const c = contents(data, inner, depth - 1)
      out.lines.push(...c.lines)
      out.sins.push(...c.sins)
      out.months.push(...c.months)
      out.licences += c.licences
      continue
    }
    out.lines.push(...itemLines(data, t, pack.source))
  }
  return out
}
const items = (pack: Sr6Entry) => pack.parts.filter(p => p.tag === 'item').map(p => p.text)

/** The pack's printed price (undefined: the catalog prints none we can read). */
export const packCost = (data: Sr6Data, pack: Sr6Entry) => bookValue(pack, 'cost', undefined, dataFind(data)).n ?? undefined

/** What buying pack `id` puts on the build `b` (b is read, never changed), or undefined for an unknown pack or one with no
 *  readable price. */
export function expandPack(data: Sr6Data, id: string, b: Pick<Sr6Build, 'sins'>): Sr6PackExpansion | undefined {
  const pack = data.entry('packs', id),
    cost = pack && packCost(data, pack)
  if (!pack || cost === undefined) return undefined
  const uid = newId(),
    c = contents(data, pack, 2),
    sins: Sr6Sin[] = c.sins.map(s => ({ ...s, pack: uid }))
  // the licences go on the pack's first SIN, each rated as it
  if (sins[0]) {
    for (let i = 0; i < c.licences; i++) sins[0].licences.push({ name: LICENCE_NAME, rating: 1 })
    rateLicences(sins[0])
  }
  // a lifestyle is always one SIN's: the pack's, else the runner's first, else a placeholder the pack brings
  let host = sins[0]?.uid ?? b.sins[0]?.uid
  if (!host && c.months.length) {
    const p: Sr6Sin = { uid: newId(), name: '', kind: 'real', licences: [], placeholder: true, pack: uid }
    sins.push(p)
    host = p.uid
  }
  return {
    uid,
    id,
    name: pack.name,
    cost,
    lines: c.lines.map(l => ({ ...l, pack: uid })),
    sins,
    lifestyles: c.months.map(m => ({ sin: host!, line: { uid: newId(), id: m.id, months: m.months, pack: uid } })),
  }
}

/** The expansion put on the build (in place); structuredClone so a stored expansion replays the same each time. */
export function applyPack(b: Sr6Build, x: Sr6PackExpansion): void {
  const e = structuredClone(x)
  b.purchases.push(...e.lines)
  b.sins.push(...e.sins)
  for (const { sin, line } of e.lifestyles) {
    const s = b.sins.find(y => y.uid === sin)
    if (s) s.lifestyles = [...(s.lifestyles ?? []), line]
  }
}

/** Every line of pack `uid` taken off the build (in place): its gear, SINs and lifestyles. */
export function removePack(b: Sr6Build, uid: string): void {
  b.purchases = b.purchases.filter(x => x.pack !== uid)
  b.sins = b.sins.filter(s => s.pack !== uid)
  for (const s of b.sins) {
    if (!s.lifestyles?.some(l => l.pack === uid)) continue
    s.lifestyles = s.lifestyles.filter(l => l.pack !== uid)
    if (!s.lifestyles.length) delete s.lifestyles
  }
}

/** The line that charges a pack's price in creation (the expansion's own lines are free); a pack's header has `pack` = its own uid. */
export const packHeader = (x: Sr6PackExpansion): Sr6Purchase => ({
  uid: x.uid,
  kind: 'gear',
  name: `${x.name} (pack price)`,
  cost: x.cost,
  avail: 0,
  essence: 0,
  qty: 1,
  accessories: [],
  pack: x.uid,
})
/** Whether a line is a pack's header (it, not its contents, carries the price). */
export const isPackHeader = (x: Pick<Sr6Purchase, 'uid' | 'pack'>) => x.pack !== undefined && x.pack === x.uid
