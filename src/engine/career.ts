// Career mode: the finalized build is the baseline; the current character is the
// baseline with every non-voided event applied in order.
import type { AmpEntry, AttrId, Build, CareerEvent, Catalog, Character, ItemEntry, KnowledgeEntry } from '../model/types'
import { newId } from '../model/types'
import { ampChangeCost, ampCtx, ampRating } from './amps'
import { attrCost, attrMax, itemCost, price, skillCost } from './price'

type NewEvent = CareerEvent extends infer E ? (E extends CareerEvent ? Omit<E, 'id' | 'at'> : never) : never
const stamp = (e: NewEvent): CareerEvent => ({ id: newId(), at: new Date().toISOString(), ...e }) as CareerEvent

export const voidedIds = (ch: Character) => new Set(ch.career.filter(e => e.type === 'void').map(e => (e as { eventId: string }).eventId))
export const activeEvents = (ch: Character) => { const v = voidedIds(ch); return ch.career.filter(e => e.type !== 'void' && !v.has(e.id)) }

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
    case 'buy': b.items.push(structuredClone(e.item)); break
    case 'sell': b.items = b.items.filter(i => i.uid !== e.itemUid); break
    case 'amp-add': b.amps.push(structuredClone(e.amp)); break
    case 'amp-modify': b.amps = b.amps.map(a => (a.uid === e.ampUid ? structuredClone(e.after) : a)); break
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

export function currentBuild(ch: Character): Build {
  const b = structuredClone(ch.build)
  for (const e of activeEvents(ch)) applyEvent(b, e)
  return b
}

const eventCost = (e: CareerEvent) => ('cost' in e ? e.cost : 0)

/** Career nuyen: creation leftover at Finalize + earnings - costs (voided events excluded). */
export function balance(c: Catalog, ch: Character): number {
  const start = ch.finalRemaining ?? price(c, ch).remaining
  return activeEvents(ch).reduce((s, e) => s + (e.type === 'earn' ? e.amount : -eventCost(e)), start)
}

export function finalize(c: Catalog, ch: Character): Character {
  return { ...ch, finalizedAt: new Date().toISOString(), finalRemaining: price(c, ch).remaining }
}

/** Undo Finalize: only while the ledger has no entries, so no recorded history is lost. */
export function reopen(ch: Character): Character {
  if (ch.career.length) throw new Error('the ledger already has entries')
  const { finalizedAt: _f, finalRemaining: _r, ...rest } = ch
  return rest as Character
}

export const makeEarn = (amount: number, run: string, date: string) => stamp({ type: 'earn', amount, run, date })
export const makeNote = (text: string) => stamp({ type: 'note', text })

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

export const makeBuy = (c: Catalog, item: ItemEntry) => stamp({ type: 'buy', item, cost: itemCost(c.pricing, item) })
export const makeSell = (itemUid: string) => stamp({ type: 'sell', itemUid })
export const makeSpec = (c: Catalog, skill: string, spec: string) => stamp({ type: 'spec-add', skill, spec, cost: c.pricing.spec })
/** A new paid entry; with `from`, renames that free slot (free) or, `pay`, turns it into a paid entry. */
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
