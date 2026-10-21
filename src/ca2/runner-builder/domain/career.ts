// Career mode (0.5.5): Finalize is a last check and a ledger entry; nothing is locked. The build stays editable,
// every change to it is logged in the ledger with the price difference at that moment (a removal refunds), and the
// balance is the ledger's running total: what creation left + earnings - those recorded prices (ledgerRunning).
// Runners finalized before 0.5.5 kept a baseline build plus events (advance, buy, sell...) applied on top; settle()
// folds those into the build once, keeps them as history and carries their balance over unchanged.
import type { AmpEntry, AttrId, Build, CareerEvent, Catalog, Change, Character, ItemEntry, KnowledgeEntry, TableFlags } from '../../formats/domain/types'
import { ATTRS, newId } from '../../formats/domain/types'
import { ampCtx, ampChangeCost, ampRating } from './amps'
import { attrCost, attrMax, catalogItem, itemCost, partPrices, price, skillCost } from './price'

type NewEvent = CareerEvent extends infer E ? (E extends CareerEvent ? Omit<E, 'id' | 'at'> : never) : never
const stamp = (e: NewEvent): CareerEvent => ({ id: newId(), at: new Date().toISOString(), ...e }) as CareerEvent

export const voidedIds = (ch: Character) => new Set(ch.career.filter(e => e.type === 'void').map(e => (e as { eventId: string }).eventId))
export const activeEvents = (ch: Character) => {
  const v = voidedIds(ch)
  return ch.career.filter(e => e.type !== 'void' && !v.has(e.id))
}

/** Applies a pre-0.5.5 event to a build (settle() folds them in once). */
export function applyEvent(b: Build, e: CareerEvent): void {
  switch (e.type) {
    case 'advance': {
      const [kind, id] = e.path.split('.')
      if (kind === 'attributes') b.attributes[id as AttrId] = e.to
      else if (kind === 'skills') {
        const s = b.skills.find(x => x.id === id)
        if (s) s.rating = e.to
        else b.skills.push({ id, rating: e.to, specs: [] })
      }
      break
    }
    case 'buy':
      b.items.push(structuredClone(e.item))
      break
    case 'sell':
      b.items = b.items.filter(i => i.uid !== e.itemUid)
      break
    case 'amp-add':
      b.amps.push(structuredClone(e.amp))
      break
    case 'amp-modify':
      b.amps = b.amps.map(a => (a.uid === e.ampUid ? structuredClone(e.after) : a))
      break
    case 'spec-add': {
      const s = b.skills.find(x => x.id === e.skill)
      if (s) s.specs.push(e.spec)
      else b.skills.push({ id: e.skill, rating: 0, specs: [e.spec] })
      break
    }
    case 'knowledge-add': {
      const entry: KnowledgeEntry = { name: e.name, kind: e.kind ?? 'knowledge' }
      if (e.from && !e.cost) entry.from = e.from
      else entry.id = e.id // a paid entry's key: its ledger entry
      const at = e.from ? b.knowledge.findIndex(k => k.from === e.from) : -1
      if (at >= 0 && b.knowledge[at].native && !e.cost) entry.native = true // a rename keeps the native mark
      if (at >= 0) b.knowledge[at] = entry
      else b.knowledge.push(entry)
      break
    }
  }
}

/** A runner finalized before 0.5.5 that hasn't been settled yet (no "Creation finished" entry): its build is the
 *  baseline, its events apply on top. */
const legacy = (ch: Character) => !!ch.finalizedAt && !ch.career.some(e => e.type === 'finalize')

/** The runner's build as it stands (a legacy runner's baseline with its events applied). */
export function currentBuild(ch: Character): Build {
  const b = structuredClone(ch.build)
  if (legacy(ch)) for (const e of activeEvents(ch)) applyEvent(b, e)
  return b
}

/** The ledger's running balance after each entry: a "Creation finished" entry sets it to what creation left, an
 *  earning adds, a change (or a pre-0.5.5 event) takes its recorded cost off; voided entries and voids leave it. The
 *  amounts are the ones recorded when each entry was made, so later catalog or price edits never move a balance. */
export function ledgerRunning(ch: Character): { e: CareerEvent; running: number; voided: boolean }[] {
  const v = voidedIds(ch)
  let running = 0
  return ch.career
    .filter(e => e.type !== 'void')
    .map(e => {
      if (e.type === 'finalize') running = e.remaining
      else if (!v.has(e.id)) running += e.type === 'earn' ? e.amount : -('cost' in e ? e.cost : 0)
      return { e, running, voided: v.has(e.id) }
    })
}

/** A legacy runner the 0.5.5 way: its events folded into the build and kept in the ledger as history, after a
 *  "Creation finished" entry with what creation left. Its running balance is the old ledger's to the nuyen. Idempotent. */
export function settle(c: Catalog, ch: Character): Character {
  if (!legacy(ch)) return ch
  const remaining = ch.finalRemaining ?? price(c, ch).remaining
  const next = { ...ch, build: currentBuild(ch), finalRemaining: remaining }
  // what each thing was paid isn't in the old ledger: today's prices stand for it
  const prices = Object.fromEntries(partPrices(c, next))
  return { ...next, career: [{ id: 'finalized', at: ch.finalizedAt!, type: 'finalize', remaining, prices }, ...ch.career] }
}

/** Career nuyen: the ledger's running balance (what creation left, + earnings, - each change's recorded price). A
 *  draft's: what's left to spend. */
export function balance(c: Catalog, ch: Character, table?: TableFlags): number {
  if (!ch.finalizedAt) return price(c, ch, table).remaining
  return ledgerRunning(settle(c, ch)).at(-1)?.running ?? 0
}

/** What creation leaves (a reopened runner's carry included) becomes the ledger's first entry; the carry is used up. A
 *  runner already finalized comes back unchanged (a second entry would reset the balance its earnings built). */
export function finalize(c: Catalog, ch: Character, table?: TableFlags): Character {
  if (ch.finalizedAt) return ch
  const remaining = price(c, ch, table).remaining
  const at = new Date().toISOString()
  const { carry: _, ...rest } = ch
  return {
    ...rest,
    finalizedAt: at,
    finalRemaining: remaining,
    career: [...ch.career, { id: newId(), at, type: 'finalize', remaining, prices: Object.fromEntries(partPrices(c, ch, table)) }],
  }
}

/** What each thing in the build was paid (price.ts priceParts keys): the last Finalize's prices, updated by every
 *  change since. A thing not in it (from a file before these were kept) goes by today's price. */
export function recordedPrices(ch: Character): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of sinceFinalize(ch, true))
    if ((e.type === 'finalize' || e.type === 'change') && e.prices) for (const [k, v] of Object.entries(e.prices)) m.set(k, v)
  return m
}

/** Back to creation: only while no earnings are recorded. The ledger keeps its entries, with a note. `carry` keeps
 *  whatever the balance holds beyond budget - build price (an old unrefunded sale, a price changed since), so
 *  reopening and finalizing again never makes or loses nuyen. */
export function reopen(c: Catalog, ch: Character): Character {
  if (activeEvents(ch).some(e => e.type === 'earn')) throw new Error('the ledger already has earnings')
  const s = settle(c, ch)
  const { finalizedAt: _f, finalRemaining: _r, carry: _c, ...rest } = s
  const carry = balance(c, s) - price(c, rest as Character).remaining
  return { ...rest, ...(carry ? { carry } : {}), career: [...s.career, stamp({ type: 'note', text: 'Creation reopened' })] } as Character
}

/** Entries since the last Finalize (a reopened runner's earlier log is history); with withIt, that entry too. */
export function sinceFinalize(ch: Character, withIt = false): CareerEvent[] {
  const at = ch.career.map(e => e.type).lastIndexOf('finalize')
  return ch.career.slice(withIt ? Math.max(0, at) : at + 1)
}

// ---- the change log ----

const qty = (n: number) => String(n)
/** What changed between two builds, one line per thing (attribute, skill, spec, knowledge entry, amp, item). */
export function diffBuild(c: Catalog, a: Build, b: Build): Change[] {
  const out: Change[] = []
  const put = (key: string, label: string, from?: string, to?: string) => {
    if (from === to) return
    const x: Change = { key, label }
    if (from !== undefined) x.from = from
    if (to !== undefined) x.to = to
    out.push(x)
  }
  for (const at of ATTRS) put(`attr:${at}`, c.attributes.get(at)?.name ?? at.toUpperCase(), qty(a.attributes[at] ?? 0), qty(b.attributes[at] ?? 0))
  const skillName = (id: string) => c.skills.get(id)?.name ?? id
  const specName = (skill: string, sp: string) => c.skills.get(skill)?.specs.find(s => s.id === sp)?.name ?? sp.replace(/^custom:/, '')
  for (const id of new Set([...a.skills, ...b.skills].map(s => s.id))) {
    const x = a.skills.find(s => s.id === id),
      y = b.skills.find(s => s.id === id)
    put(`skill:${id}`, skillName(id), qty(x?.rating ?? 0), qty(y?.rating ?? 0))
    for (const sp of new Set([...(x?.specs ?? []), ...(y?.specs ?? [])])) {
      const had = !!x?.specs.includes(sp),
        has = !!y?.specs.includes(sp)
      if (had !== has) put(`spec:${id}:${sp}`, `${skillName(id)} specialization ${specName(id, sp)}`, had ? '' : undefined, has ? '' : undefined)
    }
  }
  const kn = (k: KnowledgeEntry) => `${k.name}${k.kind === 'language' ? ' (language' + (k.native ? ', native)' : ')') : ''}`
  const key = (k: KnowledgeEntry) => k.from ?? k.id ?? `:` // derive.ts knowledgeKey
  const ka = new Map(a.knowledge.map(k => [key(k), k])),
    kb = new Map(b.knowledge.map(k => [key(k), k]))
  for (const k of new Set([...ka.keys(), ...kb.keys()])) {
    const x = ka.get(k),
      y = kb.get(k)
    put(`knowledge:${k}`, x && y ? 'Knowledge' : kn((y ?? x)!), x && (y ? kn(x) : ''), y && (x ? kn(y) : ''))
  }
  const rated = (amp: AmpEntry, bb: Build) => `rating ${ampRating(c, amp, ampCtx(bb, amp, c))}`
  const aa = new Map(a.amps.map(x => [x.uid, x])),
    ab = new Map(b.amps.map(x => [x.uid, x]))
  for (const uid of new Set([...aa.keys(), ...ab.keys()])) {
    const x = aa.get(uid),
      y = ab.get(uid)
    if (x && y && JSON.stringify(x) === JSON.stringify(y)) continue
    const from = x && rated(x, a),
      to = y && rated(y, b)
    put(`amp:${uid}`, x && y && x.name !== y.name ? `${x.name} (now ${y.name})` : (y ?? x)!.name, from, x && y && from === to ? `${to}, edited` : to)
  }
  const ia = new Map(a.items.map(x => [x.uid, x])),
    ib = new Map(b.items.map(x => [x.uid, x]))
  for (const uid of new Set([...ia.keys(), ...ib.keys()])) {
    const x = ia.get(uid),
      y = ib.get(uid)
    if (x && y && JSON.stringify(x) === JSON.stringify(y)) continue
    if (x && y) put(`item:${uid}`, x.name === y.name ? y.name : 'Renamed', x.name === y.name ? '' : x.name, x.name === y.name ? 'edited' : y.name)
    else put(`item:${uid}`, (y ?? x)!.name, x && '', y && '')
  }
  return out
}

/** A ledger line. from absent: added; to absent: removed; else changed ("Stealth: 3 → 4", "Ares Predator: edited"). */
export function changeText(x: Change): string {
  if (x.from === undefined) return `Added ${x.label}${x.to ? ` (${x.to})` : ''}`
  if (x.to === undefined) return `Removed ${x.label}`
  return x.from ? `${x.label}: ${x.from} → ${x.to}` : `${x.label}: ${x.to}`
}

const MERGE_MS = 10 * 60 * 1000
/** A finalized runner's edit, logged: one "change" entry with the lines diffBuild finds and the price difference
 *  (positive: charged, negative: refunded). A single-line change to the same thing as the last entry, within ten
 *  minutes, updates that entry instead (stepping a skill 3 → 4 → 5 is one line); undone completely, it goes. */
export function logChange(c: Catalog, before: Character, after: Character, table?: TableFlags): Character {
  if (!before.finalizedAt || !after.finalizedAt) return after
  const lines = diffBuild(c, before.build, after.build)
  // each thing whose price moved: an addition or a raise costs today's price; a removal gives back what was paid for
  // it, a lowering that share of it (recordedPrices), so a price changed since can't be turned into nuyen
  const paid = recordedPrices(before),
    was = partPrices(c, before, table),
    now = partPrices(c, after, table)
  const prices: Record<string, number> = {}
  let cost = 0
  for (const k of new Set([...was.keys(), ...now.keys()])) {
    const w = was.get(k),
      n = now.get(k),
      r = paid.get(k) ?? w ?? 0
    if (w === n) continue
    // below 0 (an amp rated under 0 gives nuyen back): the paid share down to 0, then the credit
    const next = n === undefined ? 0 : w === undefined ? n : n >= w || w <= 0 ? r + n - w : Math.round((r * Math.max(n, 0)) / w) + Math.min(n, 0)
    cost += next - (w === undefined ? 0 : r)
    prices[k] = next
  }
  if (!lines.length && !cost && !Object.keys(prices).length) return after
  if (!lines.length) lines.push({ key: 'price', label: 'Build price', from: '', to: '' })
  const last = after.career.at(-1)
  if (
    lines.length === 1 &&
    last?.type === 'change' &&
    last.changes.length === 1 &&
    last.changes[0].key === lines[0].key &&
    Date.now() - Date.parse(last.at) < MERGE_MS &&
    !voidedIds(after).has(last.id)
  ) {
    const first = last.changes[0].from
    const merged: Change = { ...lines[0] }
    if (first === undefined) delete merged.from
    else merged.from = first
    const total = last.cost + cost
    const gone = merged.from === merged.to // back where it was, or added and removed again
    const career = after.career.slice(0, -1)
    if (!(gone && !total)) career.push({ ...last, at: new Date().toISOString(), changes: [merged], cost: total, prices: { ...last.prices, ...prices } })
    return { ...after, career }
  }
  return { ...after, career: [...after.career, stamp({ type: 'change', changes: lines, cost, prices })] }
}

/** Qualities added after Finalize (they need a major event and the GM, CRB p.58). */
export function qualitiesAddedAfter(ch: Character): Set<string> {
  const v = voidedIds(ch),
    out = new Set<string>()
  for (const e of sinceFinalize(ch)) {
    if (v.has(e.id)) continue
    if (e.type === 'amp-add' && e.amp.type === 'quality') out.add(e.amp.uid)
    if (e.type === 'change') for (const x of e.changes) if (x.key.startsWith('amp:') && (x.from === undefined || x.from === '')) out.add(x.key.slice(4))
  }
  return out
}

export const makeEarn = (amount: number, run: string, date: string) => stamp({ type: 'earn', amount, run, date })
export const makeNote = (text: string) => stamp({ type: 'note', text })

// ---- pre-0.5.5 events: nothing makes them any more; tests build legacy runners with these ----

export function makeAdvance(c: Catalog, ch: Character, path: string, to: number): CareerEvent {
  const b = currentBuild(ch)
  const [kind, id] = path.split('.')
  if (kind === 'attributes') {
    const from = b.attributes[id as AttrId]
    return stamp({ type: 'advance', path, from, to, cost: attrCost(c.pricing, from, to, attrMax(c, ch.identity.metatype, id as AttrId)) })
  }
  if (kind === 'skills') {
    const from = b.skills.find(s => s.id === id)?.rating ?? 0
    return stamp({ type: 'advance', path, from, to, cost: skillCost(c.pricing, from, to) })
  }
  throw new Error(`cannot advance "${path}"`)
}
export const makeBuy = (c: Catalog, item: ItemEntry) => stamp({ type: 'buy', item, cost: itemCost(c.pricing, item, catalogItem(c, item)) })
export const makeSell = (itemUid: string) => stamp({ type: 'sell', itemUid })
export const makeSpec = (c: Catalog, skill: string, spec: string) => stamp({ type: 'spec-add', skill, spec, cost: c.pricing.spec })
export const makeKnowledge = (c: Catalog, e: KnowledgeEntry, pay = !e.from) =>
  stamp({ type: 'knowledge-add', name: e.name, kind: e.kind, from: e.from, cost: pay ? c.pricing.knowledge : 0 })
export function makeAmpAdd(c: Catalog, ch: Character, amp: AmpEntry): CareerEvent {
  const b = currentBuild(ch)
  b.amps.push(amp)
  return stamp({ type: 'amp-add', amp, cost: ampRating(c, amp, ampCtx(b, amp)) * c.pricing.ampPoint })
}
export function makeAmpModify(c: Catalog, ch: Character, after: AmpEntry): CareerEvent {
  const b = currentBuild(ch)
  const before = b.amps.find(a => a.uid === after.uid)
  if (!before) throw new Error(`no amp ${after.uid}`)
  return stamp({ type: 'amp-modify', ampUid: after.uid, before, after, cost: ampChangeCost(c, before, after, ampCtx(b, before)) })
}

export function voidEvent(ch: Character, eventId: string, reason: string): Character {
  const target = ch.career.find(e => e.id === eventId)
  if (!target) throw new Error('no such event')
  if (target.type === 'void') throw new Error('a void cannot be voided')
  if (voidedIds(ch).has(eventId)) throw new Error('event already voided')
  return { ...ch, career: [...ch.career, stamp({ type: 'void', eventId, reason })] }
}

export const appendEvent = (ch: Character, e: CareerEvent): Character => ({ ...ch, career: [...ch.career, e] })
